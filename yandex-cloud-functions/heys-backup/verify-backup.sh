#!/bin/bash

# HEYS Backup Verification Script
# 
# Проверяет целостность бэкапов без полного восстановления.
# Использует pg_restore --list для валидации структуры дампа.
#
# Usage:
#   ./verify-backup.sh <backup-file>
#   ./verify-backup.sh s3://heys-backups/heys-production-2026-01-23T03-00-00.dump.gz
#   ./verify-backup.sh /tmp/backup.dump.gz
#
# Exit codes:
#   0 - Backup valid
#   1 - Backup corrupted or invalid
#   2 - Missing dependencies

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BACKUP_FILE=$1
TEMP_DIR="/tmp/heys-backup-verify-$$"

# Functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
  log_info "Checking dependencies..."
  
  if ! command -v pg_restore &> /dev/null; then
    log_error "pg_restore not found. Install PostgreSQL client tools."
    exit 2
  fi
  
  if ! command -v gzip &> /dev/null; then
    log_error "gzip not found. Install gzip."
    exit 2
  fi
  
  log_info "✓ All dependencies found"
}

download_from_s3() {
  local s3_path=$1
  local local_path=$2
  
  log_info "Downloading from S3: $s3_path"
  
  if ! command -v aws &> /dev/null; then
    log_error "aws CLI not found. Install AWS CLI for S3 support."
    exit 2
  fi
  
  aws s3 cp "$s3_path" "$local_path" \
    --endpoint-url https://storage.yandexcloud.net \
    --quiet
  
  if [ $? -ne 0 ]; then
    log_error "Failed to download from S3"
    exit 1
  fi
  
  log_info "✓ Downloaded successfully"
}

verify_backup() {
  local backup_file=$1
  
  log_info "Verifying backup: $(basename $backup_file)"
  
  # Check file exists
  if [ ! -f "$backup_file" ]; then
    log_error "Backup file not found: $backup_file"
    exit 1
  fi
  
  # Check file size
  local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
  if [ "$file_size" -lt 1000 ]; then
    log_error "Backup file too small (${file_size} bytes), likely corrupted"
    exit 1
  fi
  log_info "✓ File size: $(numfmt --to=iec-i --suffix=B $file_size 2>/dev/null || echo ${file_size}B)"
  
  # Decompress if gzipped
  local dump_file="$backup_file"
  if [[ "$backup_file" == *.gz ]]; then
    log_info "Decompressing gzip file..."
    dump_file="${TEMP_DIR}/backup.dump"
    
    if ! gzip -dc "$backup_file" > "$dump_file"; then
      log_error "Failed to decompress backup (gzip error)"
      exit 1
    fi
    
    log_info "✓ Decompressed successfully"
  fi
  
  # Verify with pg_restore --list
  log_info "Running pg_restore validation..."
  
  local list_output="${TEMP_DIR}/restore-list.txt"
  if ! pg_restore --list "$dump_file" > "$list_output" 2>&1; then
    log_error "pg_restore validation failed"
    cat "$list_output"
    exit 1
  fi
  
  # Count objects in dump
  local table_count=$(grep -c "TABLE" "$list_output" || echo "0")
  local sequence_count=$(grep -c "SEQUENCE" "$list_output" || echo "0")
  local index_count=$(grep -c "INDEX" "$list_output" || echo "0")
  
  log_info "✓ Backup structure valid:"
  log_info "  - Tables: $table_count"
  log_info "  - Sequences: $sequence_count"
  log_info "  - Indexes: $index_count"
  
  # Check for critical tables (adjust to your schema)
  local critical_tables=("clients" "sessions" "payments" "subscriptions")
  local missing_tables=()
  
  for table in "${critical_tables[@]}"; do
    if ! grep -q "TABLE.*$table" "$list_output"; then
      missing_tables+=("$table")
    fi
  done
  
  if [ ${#missing_tables[@]} -gt 0 ]; then
    log_warn "Warning: Critical tables missing from backup:"
    for table in "${missing_tables[@]}"; do
      log_warn "  - $table"
    done
  else
    log_info "✓ All critical tables present"
  fi
  
  # Cleanup
  if [ -f "$dump_file" ] && [ "$dump_file" != "$backup_file" ]; then
    rm -f "$dump_file"
  fi
}

cleanup() {
  log_info "Cleaning up..."
  rm -rf "$TEMP_DIR"
}

# Main
main() {
  if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Examples:"
    echo "  $0 /tmp/backup.dump.gz"
    echo "  $0 s3://heys-backups/heys-production-2026-01-23T03-00-00.dump.gz"
    exit 1
  fi
  
  # Setup
  mkdir -p "$TEMP_DIR"
  trap cleanup EXIT
  
  check_dependencies
  
  # Handle S3 paths
  local_backup="$BACKUP_FILE"
  if [[ "$BACKUP_FILE" == s3://* ]]; then
    local_backup="${TEMP_DIR}/$(basename $BACKUP_FILE)"
    download_from_s3 "$BACKUP_FILE" "$local_backup"
  fi
  
  # Verify
  verify_backup "$local_backup"
  
  # Success
  log_info ""
  log_info "=========================================="
  log_info "✓ Backup verification PASSED"
  log_info "=========================================="
  exit 0
}

main
