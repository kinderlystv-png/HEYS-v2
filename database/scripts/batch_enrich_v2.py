#!/usr/bin/env python3
"""
Batch USDA Enrichment - v2
Optimized for processing products with existing iron/magnesium/zinc
Only adds missing parameters (omega3, omega6, cholesterol, vitamins)
"""

import sys
import psycopg2
import requests
import time
from typing import Dict, Optional

# Database connection
DB_CONFIG = {
    'host': 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
    'port': 6432,
    'user': 'heys_admin',
    'password': 'heys007670',
    'database': 'heys_production'
}

# USDA API config
USDA_API_KEY = "DEMO_KEY"  # Rate limited to 30 requests/hour, replace with real key for production
USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"

# USDA nutrient IDs
NUTRIENT_MAP = {
    'omega3': [1404, 1405, 1406],  # ALA, EPA, DHA
    'omega6': 1269,
    'cholesterol': 1253,
    'vitamin_a': 1106,  # RAE
    'vitamin_d': 1114,
    'vitamin_e': 1109,
    'vitamin_k': 1185,
    'vitamin_b1': 1165,
    'vitamin_b2': 1166,
    'vitamin_b3': 1167,
    'vitamin_b6': 1175,
    'vitamin_b9': 1177,
    'vitamin_b12': 1178,
    'vitamin_c': 1162,
}

def get_products_needing_enrichment(conn, limit=10):
    """Get products that have iron but missing omega/cholesterol"""
    cursor = conn.cursor()
    query = """
        SELECT id, name, category, 
               iron, magnesium, zinc
        FROM shared_products 
        WHERE iron IS NOT NULL 
          AND (cholesterol IS NULL OR omega3_100 IS NULL OR omega6_100 IS NULL)
        ORDER BY id
        LIMIT %s;
    """
    cursor.execute(query, (limit,))
    results = cursor.fetchall()
    cursor.close()
    return results

def search_usda(product_name: str, max_results=3) -> list:
    """Search USDA database for product"""
    # Auto-translate common Russian terms
    translations = {
        'курица': 'chicken',
        'куриц': 'chicken',
        'говядина': 'beef',
        'свинина': 'pork',
        'индейка': 'turkey',
        'рыба': 'fish',
        'лосось': 'salmon',
        'треска': 'cod',
        'молоко': 'milk',
        'творог': 'cottage cheese',
        'кефир': 'kefir',
        'йогурт': 'yogurt',
        'яйц': 'egg',
        'гречка': 'buckwheat',
        'рис': 'rice',
        'овс': 'oat',
        'картофель': 'potato',
        'капуста': 'cabbage',
        'морковь': 'carrot',
    }
    
    search_term = product_name.lower()
    for ru, en in translations.items():
        if ru in search_term:
            search_term = en
            break
    
    params = {
        'api_key': USDA_API_KEY,
        'query': search_term,
        'pageSize': max_results,
        'dataType': ['Foundation', 'SR Legacy']  # High-quality databases
    }
    
    try:
        response = requests.get(USDA_SEARCH_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get('foods', [])
    except Exception as e:
        print(f"❌ USDA API error: {e}")
        return []

def extract_nutrients(food_data: dict) -> dict:
    """Extract nutrients from USDA food data"""
    nutrients = {}
    food_nutrients = food_data.get('foodNutrients', [])
    
    # Extract omega-3 (sum of ALA, EPA, DHA)
    omega3_total = 0
    for nid in NUTRIENT_MAP['omega3']:
        for nutrient in food_nutrients:
            if nutrient.get('nutrientId') == nid:
                omega3_total += nutrient.get('value', 0)
    if omega3_total > 0:
        nutrients['omega3_100'] = round(omega3_total, 2)
    
    # Extract other nutrients
    for key, nid in NUTRIENT_MAP.items():
        if key == 'omega3':  # Already handled
            continue
        if isinstance(nid, list):  # Skip complex mappings
            continue
        
        for nutrient in food_nutrients:
            if nutrient.get('nutrientId') == nid:
                value = nutrient.get('value', 0)
                if value > 0:
                    # Convert units: USDA uses µg for some, we need mg
                    if key == 'cholesterol':
                        nutrients[key] = round(value, 1)  # mg
                    elif key in ['vitamin_d', 'vitamin_k', 'vitamin_b9', 'vitamin_b12']:
                        nutrients[key] = round(value, 1)  # µg
                    elif key == 'omega6':
                        nutrients['omega6_100'] = round(value, 2)  # g
                    else:
                        nutrients[key] = round(value, 2)  # mg
                break
    
    return nutrients

def generate_update_sql(product_id: str, nutrients: dict) -> str:
    """Generate UPDATE statement for product"""
    if not nutrients:
        return ""
    
    set_clauses = []
    for key, value in nutrients.items():
        set_clauses.append(f"{key} = {value}")
    
    set_clauses.append("updated_at = CURRENT_TIMESTAMP")
    
    sql = f"""UPDATE shared_products SET
  {', '.join(set_clauses)}
WHERE id = '{product_id}';"""
    
    return sql

def batch_enrich(batch_size=10, dry_run=False):
    """Main enrichment function"""
    print("=" * 60)
    print("🌽 HEYS USDA Batch Enrichment v2")
    print("=" * 60)
    
    # Connect to database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print("✅ Connected to database")
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return
    
    # Get products
    products = get_products_needing_enrichment(conn, batch_size)
    if not products:
        print("✅ No products need enrichment!")
        conn.close()
        return
    
    print(f"\n📦 Found {len(products)} products to enrich")
    print("-" * 60)
    
    enriched_count = 0
    failed_count = 0
    
    for idx, (product_id, name, category, iron, magnesium, zinc) in enumerate(products, 1):
        print(f"\n[{idx}/{len(products)}] {name} (iron: {iron}, mg: {magnesium}, zn: {zinc})")
        
        # Search USDA
        foods = search_usda(name)
        if not foods:
            print(f"  ⚠️  No USDA match found - skipping")
            failed_count += 1
            continue
        
        # Use first result
        food = foods[0]
        print(f"  🔍 USDA match: {food.get('description')}")
        
        # Extract nutrients
        nutrients = extract_nutrients(food)
        if not nutrients:
            print(f"  ⚠️  No nutrients extracted - skipping")
            failed_count += 1
            continue
        
        print(f"  📊 Extracted: {', '.join([f'{k}={v}' for k, v in nutrients.items()])}")
        
        # Generate SQL
        sql = generate_update_sql(product_id, nutrients)
        
        if dry_run:
            print(f"  🔧 DRY RUN - SQL:\n{sql}")
        else:
            # Execute update
            try:
                cursor = conn.cursor()
                cursor.execute(sql)
                conn.commit()
                cursor.close()
                print(f"  ✅ Updated successfully")
                enriched_count += 1
            except Exception as e:
                print(f"  ❌ Update failed: {e}")
                conn.rollback()
                failed_count += 1
        
        # Rate limit (DEMO_KEY allows 30 requests/hour)
        if not dry_run and idx < len(products):
            time.sleep(2)  # Be nice to USDA API
    
    print("\n" + "=" * 60)
    print(f"✅ Enriched: {enriched_count}")
    print(f"❌ Failed: {failed_count}")
    print("=" * 60)
    
    conn.close()

if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    batch_size = 10
    
    if '--batch-size' in sys.argv:
        idx = sys.argv.index('--batch-size')
        batch_size = int(sys.argv[idx + 1])
    
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"Batch size: {batch_size}")
    
    if not dry_run:
        confirm = input("\n⚠️  This will UPDATE the database. Continue? (yes/no): ")
        if confirm.lower() != 'yes':
            print("Aborted.")
            sys.exit(0)
    
    batch_enrich(batch_size, dry_run)
