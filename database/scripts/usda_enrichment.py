#!/usr/bin/env python3
"""
HEYS v2 — USDA FoodData Central Integration
Скрипт для получения данных из USDA API и генерации SQL UPDATE запросов
Дата: 2026-02-11
"""

import requests
import json
import time
from typing import Dict, Optional, List

# USDA FoodData Central API
# Получить API key: https://fdc.nal.usda.gov/api-key-signup.html
USDA_API_KEY = "DEMO_KEY"  # ⚠️ ЗАМЕНИТЬ на реальный API key
USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1"

# Mapping USDA nutrient IDs → наши поля
NUTRIENT_MAPPING = {
    # Macros
    1003: "protein100",      # Protein
    1005: "simple100",       # Total sugars (approx simple carbs)
    1009: "complex100",      # Starch (approx complex carbs)
    1258: "badFat100",       # Saturated fat
    1292: "goodFat100",      # MUFA + PUFA (approx good fat)
    1257: "trans100",        # Trans fat
    1079: "fiber100",        # Fiber
    
    # Extended
    1093: "sodium100",       # Sodium (mg)
    1404: "omega3_100",      # EPA + DHA (g)
    1269: "omega6_100",      # Linoleic acid (g)
    1253: "cholesterol100",  # Cholesterol (mg)
    
    # Minerals (% DV calculated from mg/mcg)
    1089: "iron",            # Iron (mg) → % DV (18mg = 100%)
    1090: "magnesium",       # Magnesium (mg) → % DV (400mg = 100%)
    1095: "zinc",            # Zinc (mg) → % DV (11mg = 100%)
    1087: "calcium",         # Calcium (mg) → % DV (1000mg = 100%)
    1092: "potassium",       # Potassium (mg) → % DV (4700mg = 100%)
    1103: "selenium",        # Selenium (mcg) → % DV (55mcg = 100%)
    1100: "iodine",          # Iodine (mcg) → % DV (150mcg = 100%)
    
    # Vitamins (% DV calculated from mg/mcg)
    1106: "vitamin_a",       # Vitamin A (mcg RAE) → % DV (900mcg = 100%)
    1165: "vitamin_b1",      # Thiamin (mg) → % DV (1.2mg = 100%)
    1166: "vitamin_b2",      # Riboflavin (mg) → % DV (1.3mg = 100%)
    1167: "vitamin_b3",      # Niacin (mg) → % DV (16mg = 100%)
    1175: "vitamin_b6",      # Vitamin B6 (mg) → % DV (1.7mg = 100%)
    1177: "vitamin_b9",      # Folate (mcg DFE) → % DV (400mcg = 100%)
    1178: "vitamin_b12",     # Vitamin B12 (mcg) → % DV (2.4mcg = 100%)
    1162: "vitamin_c",       # Vitamin C (mg) → % DV (90mg = 100%)
    1114: "vitamin_d",       # Vitamin D (mcg) → % DV (20mcg = 100%)
    1109: "vitamin_e",       # Vitamin E (mg) → % DV (15mg = 100%)
    1185: "vitamin_k",       # Vitamin K (mcg) → % DV (120mcg = 100%)
}

# DV (Daily Value) для расчёта % DV
DV_MINERALS = {
    "iron": 18,          # mg
    "magnesium": 400,    # mg
    "zinc": 11,          # mg
    "calcium": 1000,     # mg
    "potassium": 4700,   # mg
    "selenium": 55,      # mcg
    "iodine": 150,       # mcg
}

DV_VITAMINS = {
    "vitamin_a": 900,    # mcg RAE
    "vitamin_b1": 1.2,   # mg
    "vitamin_b2": 1.3,   # mg
    "vitamin_b3": 16,    # mg
    "vitamin_b6": 1.7,   # mg
    "vitamin_b9": 400,   # mcg DFE
    "vitamin_b12": 2.4,  # mcg
    "vitamin_c": 90,     # mg
    "vitamin_d": 20,     # mcg
    "vitamin_e": 15,     # mg
    "vitamin_k": 120,    # mcg
}


def search_food(query: str, max_results: int = 10) -> List[Dict]:
    """Search USDA food database by name"""
    url = f"{USDA_API_BASE}/foods/search"
    params = {
        "api_key": USDA_API_KEY,
        "query": query,
        "pageSize": max_results,
        "dataType": "SR Legacy"  # Standard Reference (most complete)
    }
    
    response = requests.get(url, params=params)
    if response.status_code != 200:
        print(f"❌ Error searching '{query}': {response.status_code}")
        return []
    
    data = response.json()
    foods = data.get("foods", [])
    
    results = []
    for food in foods:
        results.append({
            "fdc_id": food.get("fdcId"),
            "description": food.get("description"),
            "data_type": food.get("dataType"),
            "brand_owner": food.get("brandOwner", "")
        })
    
    return results


def get_food_nutrients(fdc_id: int) -> Optional[Dict]:
    """Get detailed nutrient data for specific food"""
    url = f"{USDA_API_BASE}/food/{fdc_id}"
    params = {"api_key": USDA_API_KEY}
    
    response = requests.get(url, params=params)
    if response.status_code != 200:
        print(f"❌ Error getting nutrients for FDC ID {fdc_id}: {response.status_code}")
        return None
    
    data = response.json()
    
    # Extract nutrients
    nutrients = {}
    for nutrient in data.get("foodNutrients", []):
        nutrient_id = nutrient.get("nutrient", {}).get("id")
        amount = nutrient.get("amount")
        
        if nutrient_id in NUTRIENT_MAPPING and amount is not None:
            field_name = NUTRIENT_MAPPING[nutrient_id]
            
            # Convert to % DV if needed
            if field_name in DV_MINERALS:
                nutrients[field_name] = round((amount / DV_MINERALS[field_name]) * 100, 1)
            elif field_name in DV_VITAMINS:
                nutrients[field_name] = round((amount / DV_VITAMINS[field_name]) * 100, 1)
            else:
                nutrients[field_name] = round(amount, 2)
    
    return nutrients


def generate_sql_update(product_id: str, product_name: str, nutrients: Dict) -> str:
    """Generate SQL UPDATE statement"""
    
    set_clauses = []
    for field, value in nutrients.items():
        if value is not None:
            if isinstance(value, bool):
                set_clauses.append(f"  {field} = {str(value).lower()}")
            elif isinstance(value, str):
                set_clauses.append(f"  {field} = '{value}'")
            else:
                set_clauses.append(f"  {field} = {value}")
    
    set_clauses.append("  updated_at = NOW()")
    
    sql = f"""-- {product_name} (ID: {product_id})
UPDATE shared_products
SET
{',\\n'.join(set_clauses)}
WHERE id = '{product_id}';
"""
    return sql


def interactive_mode():
    """Interactive mode for searching and generating SQL"""
    print("🌽 HEYS v2 — USDA Food Data Enrichment")
    print("=" * 60)
    print()
    
    while True:
        query = input("\n🔍 Поиск продукта (или 'exit' для выхода): ").strip()
        if query.lower() == 'exit':
            break
        
        if not query:
            continue
        
        # Search
        print(f"\n⏳ Поиск '{query}' в USDA...")
        results = search_food(query)
        
        if not results:
            print("❌ Продукты не найдены")
            continue
        
        # Show results
        print(f"\n✅ Найдено {len(results)} вариантов:\n")
        for i, food in enumerate(results, 1):
            print(f"{i}. {food['description']} (FDC ID: {food['fdc_id']})")
            if food['brand_owner']:
                print(f"   Бренд: {food['brand_owner']}")
        
        # Select
        try:
            choice = int(input("\n🎯 Выбрать номер (1-10): ").strip())
            if choice < 1 or choice > len(results):
                print("❌ Неверный номер")
                continue
        except ValueError:
            print("❌ Неверный ввод")
            continue
        
        selected = results[choice - 1]
        
        # Get nutrients
        print(f"\n⏳ Получение данных для '{selected['description']}'...")
        nutrients = get_food_nutrients(selected['fdc_id'])
        
        if not nutrients:
            print("❌ Не удалось получить данные")
            continue
        
        # Show nutrients
        print(f"\n✅ Получено {len(nutrients)} параметров:\n")
        for field, value in sorted(nutrients.items()):
            print(f"  {field}: {value}")
        
        # Generate SQL
        product_id = input("\n💾 ID продукта в HEYS БД: ").strip()
        if not product_id:
            print("⚠️ Пропускаем генерацию SQL")
            continue
        
        sql = generate_sql_update(product_id, selected['description'], nutrients)
        
        print("\n📝 Сгенерированный SQL:\n")
        print(sql)
        
        # Save to file
        filename = f"update_{product_id}_{int(time.time())}.sql"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(sql)
        
        print(f"\n💾 SQL сохранён в файл: {filename}")


def batch_mode(product_list_file: str):
    """Batch mode for processing multiple products"""
    print(f"📦 Batch mode — обработка {product_list_file}")
    
    # Expected format: JSON array [{"id": "...", "name": "...", "usda_query": "..."}, ...]
    with open(product_list_file, 'r', encoding='utf-8') as f:
        products = json.load(f)
    
    all_sql = []
    
    for product in products:
        product_id = product['id']
        product_name = product['name']
        query = product.get('usda_query', product_name)
        
        print(f"\n⏳ Обработка: {product_name} (ID: {product_id})")
        
        # Search
        results = search_food(query, max_results=1)
        if not results:
            print(f"  ⚠️ Не найдено в USDA, пропускаем")
            continue
        
        # Get nutrients
        nutrients = get_food_nutrients(results[0]['fdc_id'])
        if not nutrients:
            print(f"  ⚠️ Не удалось получить данные")
            continue
        
        # Generate SQL
        sql = generate_sql_update(product_id, product_name, nutrients)
        all_sql.append(sql)
        
        print(f"  ✅ Готово ({len(nutrients)} параметров)")
        
        # Rate limiting
        time.sleep(0.5)  # USDA API limit: 1000 requests/hour
    
    # Save all SQL
    output_file = "batch_update_products.sql"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- HEYS v2 — Batch Product Update\n")
        f.write(f"-- Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("-- Products processed: {}\n\n".format(len(all_sql)))
        f.write("\n".join(all_sql))
    
    print(f"\n✅ Batch обработка завершена!")
    print(f"📝 SQL сохранён в: {output_file}")
    print(f"📊 Обработано продуктов: {len(all_sql)}/{len(products)}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        # Batch mode
        batch_mode(sys.argv[1])
    else:
        # Interactive mode
        interactive_mode()
