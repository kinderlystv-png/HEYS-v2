/**
 * HEYS Backup Cloud Function
 * 
 * Автоматический бэкап PostgreSQL базы данных в Yandex Object Storage (S3)
 * 
 * Features:
 *   - pg_dump для создания полного бэкапа БД
 *   - gzip сжатие для экономии места
 *   - Загрузка в S3 bucket (heys-backups)
 *   - Ротация старых бэкапов (сохранение последних 7 дней)
 *   - Уведомления в Telegram при ошибках
 * 
 * Environment variables:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD - PostgreSQL
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY - Yandex Object Storage credentials
 *   S3_BUCKET - название bucket (по умолчанию: heys-backups)
 *   S3_ENDPOINT - endpoint Object Storage (по умолчанию: https://storage.yandexcloud.net)
 *   BACKUP_RETENTION_DAYS - количество дней хранения бэкапов (по умолчанию: 7)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID - для уведомлений об ошибках
 * 
 * Trigger: Yandex Cloud Functions Timer Trigger
 *   cron: 0 3 * * ? (каждый день в 03:00 UTC)
 */

const { spawn } = require('child_process');
const { createReadStream, createWriteStream, unlinkSync, existsSync } = require('fs');
const { createGzip } = require('zlib');
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  pg: {
    host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    port: process.env.PG_PORT || '6432',
    database: process.env.PG_DATABASE || 'heys_production',
    user: process.env.PG_USER || 'heys_admin',
    password: process.env.PG_PASSWORD
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net',
    region: 'ru-central1',
    bucket: process.env.S3_BUCKET || 'heys-backups',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  },
  backup: {
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '7'),
    tmpDir: '/tmp'
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Отправка уведомления в Telegram
 */
async function sendTelegramAlert(message, isError = true) {
  if (!CONFIG.telegram.botToken || !CONFIG.telegram.chatId) {
    console.log('[Telegram] Not configured, skipping alert');
    return;
  }

  const emoji = isError ? '🚨' : '✅';
  const text = `${emoji} *HEYS Backup*\n\n${message}`;

  try {
    // Node.js 18+ has built-in fetch
    // For older Node.js versions, use node-fetch or https module
    const https = require('https');
    const url = new URL(`https://api.telegram.org/bot${CONFIG.telegram.botToken}/sendMessage`);
    const data = JSON.stringify({
      chat_id: CONFIG.telegram.chatId,
      text: text,
      parse_mode: 'Markdown'
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(url, options, (res) => {
      let result = '';
      res.on('data', (chunk) => { result += chunk; });
      res.on('end', () => {
        console.log('[Telegram] Alert sent:', res.statusCode === 200);
      });
    });

    req.on('error', (error) => {
      console.error('[Telegram Error]', error.message);
    });

    req.write(data);
    req.end();
  } catch (error) {
    console.error('[Telegram Error]', error.message);
  }
}

/**
 * Создание pg_dump бэкапа
 * Возвращает путь к созданному файлу
 */
function createPgDump(outputPath) {
  return new Promise((resolve, reject) => {
    const env = {
      PGPASSWORD: CONFIG.pg.password,
      PGSSLMODE: 'require'
    };

    const args = [
      '-h', CONFIG.pg.host,
      '-p', CONFIG.pg.port,
      '-U', CONFIG.pg.user,
      '-d', CONFIG.pg.database,
      '-F', 'c',  // Custom format (для сжатия)
      '-b',       // Include blobs
      '-v',       // Verbose
      '-f', outputPath
    ];

    console.log('[Backup] Starting pg_dump...');
    const pgDump = spawn('pg_dump', args, { env: { ...process.env, ...env } });

    let stderr = '';

    pgDump.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('[pg_dump]', data.toString().trim());
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        console.log('[Backup] pg_dump completed successfully');
        resolve(outputPath);
      } else {
        reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
      }
    });

    pgDump.on('error', (err) => {
      reject(new Error(`pg_dump spawn error: ${err.message}`));
    });
  });
}

/**
 * Сжатие файла с помощью gzip
 */
function compressFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('[Backup] Compressing with gzip...');
    const gzip = createGzip({ level: 9 });
    const source = createReadStream(inputPath);
    const destination = createWriteStream(outputPath);

    source
      .pipe(gzip)
      .pipe(destination)
      .on('finish', () => {
        console.log('[Backup] Compression completed');
        resolve(outputPath);
      })
      .on('error', reject);
  });
}

/**
 * Загрузка файла в S3
 */
async function uploadToS3(filePath, s3Key) {
  const s3Client = new S3Client({
    endpoint: CONFIG.s3.endpoint,
    region: CONFIG.s3.region,
    credentials: {
      accessKeyId: CONFIG.s3.accessKeyId,
      secretAccessKey: CONFIG.s3.secretAccessKey
    }
  });

  console.log('[Backup] Uploading to S3:', s3Key);

  const fileStream = createReadStream(filePath);
  const uploadParams = {
    Bucket: CONFIG.s3.bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: 'application/gzip',
    StorageClass: 'COLD',  // Холодное хранилище для бэкапов (дешевле)
    ServerSideEncryption: 'AES256'  // Шифрование на стороне S3
  };

  const command = new PutObjectCommand(uploadParams);
  await s3Client.send(command);

  console.log('[Backup] Upload completed');
}

/**
 * Удаление старых бэкапов (старше retentionDays)
 */
async function cleanupOldBackups() {
  const s3Client = new S3Client({
    endpoint: CONFIG.s3.endpoint,
    region: CONFIG.s3.region,
    credentials: {
      accessKeyId: CONFIG.s3.accessKeyId,
      secretAccessKey: CONFIG.s3.secretAccessKey
    }
  });

  console.log('[Backup] Checking for old backups...');

  // Получаем список всех бэкапов
  const listCommand = new ListObjectsV2Command({
    Bucket: CONFIG.s3.bucket,
    Prefix: 'heys-production-'
  });

  const listResult = await s3Client.send(listCommand);
  if (!listResult.Contents || listResult.Contents.length === 0) {
    console.log('[Backup] No backups found for cleanup');
    return;
  }

  // Вычисляем дату отсечения
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.backup.retentionDays);

  // Удаляем старые бэкапы
  let deletedCount = 0;
  for (const obj of listResult.Contents) {
    if (obj.LastModified < cutoffDate) {
      console.log('[Backup] Deleting old backup:', obj.Key);
      const deleteCommand = new DeleteObjectCommand({
        Bucket: CONFIG.s3.bucket,
        Key: obj.Key
      });
      await s3Client.send(deleteCommand);
      deletedCount++;
    }
  }

  console.log(`[Backup] Cleanup completed: deleted ${deletedCount} old backups`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════════════════════

module.exports.handler = async function(event, context) {
  const startTime = Date.now();
  console.log('[Backup] Starting backup process...');

  // Проверяем доступность pg_dump
  try {
    const { execSync } = require('child_process');
    execSync('which pg_dump', { stdio: 'pipe' });
  } catch (e) {
    const error = 
      'pg_dump binary not found in PATH. ' +
      'This function requires PostgreSQL client tools to be installed in the runtime environment.';
    console.error('[Backup Error]', error);
    await sendTelegramAlert(`Backup failed: ${error}`);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error,
        suggestion: 
          'Consider using a custom runtime with pg_dump or alternative backup approach ' +
          '(SQL COPY, pg_basebackup, or external backup VM)'
      }) 
    };
  }

  // Проверяем конфигурацию
  if (!CONFIG.pg.password) {
    const error = 'PG_PASSWORD not configured';
    console.error('[Backup Error]', error);
    await sendTelegramAlert(`Backup failed: ${error}`);
    return { statusCode: 500, body: JSON.stringify({ error }) };
  }

  if (!CONFIG.s3.accessKeyId || !CONFIG.s3.secretAccessKey) {
    const error = 'S3 credentials not configured';
    console.error('[Backup Error]', error);
    await sendTelegramAlert(`Backup failed: ${error}`);
    return { statusCode: 500, body: JSON.stringify({ error }) };
  }

  // Генерируем имена файлов с timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dumpFile = path.join(CONFIG.backup.tmpDir, `heys-backup-${timestamp}.dump`);
  const gzipFile = path.join(CONFIG.backup.tmpDir, `heys-backup-${timestamp}.dump.gz`);
  const s3Key = `heys-production-${timestamp}.dump.gz`;

  try {
    // 1. Создаём pg_dump
    await createPgDump(dumpFile);

    // 2. Сжимаем gzip
    await compressFile(dumpFile, gzipFile);

    // 3. Загружаем в S3
    await uploadToS3(gzipFile, s3Key);

    // 4. Очищаем старые бэкапы
    await cleanupOldBackups();

    // 5. Удаляем временные файлы
    console.log('[Backup] Cleaning up temporary files...');
    if (existsSync(dumpFile)) unlinkSync(dumpFile);
    if (existsSync(gzipFile)) unlinkSync(gzipFile);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const successMessage = 
      `Backup completed successfully in ${duration}s\n\n` +
      `File: \`${s3Key}\`\n` +
      `Bucket: \`${CONFIG.s3.bucket}\``;
    
    console.log('[Backup] Success!', successMessage);
    
    // Отправляем успешное уведомление только раз в неделю (чтобы не спамить)
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0) {  // Воскресенье
      await sendTelegramAlert(successMessage, false);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        s3Key: s3Key,
        bucket: CONFIG.s3.bucket,
        duration: duration
      })
    };

  } catch (error) {
    console.error('[Backup Error]', error);

    // Очищаем временные файлы при ошибке
    try {
      if (existsSync(dumpFile)) unlinkSync(dumpFile);
      if (existsSync(gzipFile)) unlinkSync(gzipFile);
    } catch (cleanupError) {
      console.error('[Backup] Cleanup error:', cleanupError);
    }

    // Отправляем уведомление об ошибке
    await sendTelegramAlert(`Backup failed: ${error.message}`);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
