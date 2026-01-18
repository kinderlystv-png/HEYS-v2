import fs from 'fs';
import path from 'path';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
    console.error('Usage: node generate-sodium100-from-names.mjs <input.tsv> <output.sql>');
    process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

const exact = new Map([
    ['майонез провансаль', 635],
    ['хлеб белый', 491],
    ['хлебцы dr.korner кукурузно-рисовые с прованскими травами', 350],
    ['гранола шоколадная самокат', 12],
    ['шпинат', 79],
    ['творог 5%', 41],
    ['семена чиа', 16],
    ['изюм', 11],
    ['курага', 10],
    ['авокадо', 7],
    ['помидор', 5],
    ['банан', 1],
    ['груша', 1],
    ['клубника', 1],
    ['виноград', 2],
    ['грецкий орех', 2],
    ['миндаль', 1],
    ['яблоко', 1],
]);

const hasAny = (name, keys) => keys.some((k) => name.includes(k));

const isFish = (name) => hasAny(name, [
    'лосос', 'семг', 'форел', 'горбуш', 'тунец', 'кильк', 'икр', 'рыб', 'морск', 'краб'
]);

const isMeat = (name) => hasAny(name, [
    'кур', 'индейк', 'говядин', 'свин', 'кролик', 'утк', 'ветчин', 'сосиск', 'колбас',
    'котлет', 'паштет', 'карпаччо', 'холодец', 'люля', 'тефтел', 'бризол', 'голень', 'филе'
]);

const isDairy = (name) => hasAny(name, [
    'молок', 'кефир', 'йогурт', 'творог', 'сыр', 'сливк', 'сметан', 'масло сливоч'
]);

const isBread = (name) => hasAny(name, ['хлеб', 'лаваш', 'хлебц', 'булк', 'тост']);

const isGrain = (name) => hasAny(name, [
    'рис', 'греч', 'киноа', 'булгур', 'пшён', 'овсян', 'лапша', 'удон', 'макарон', 'мука', 'тесто', 'крупа'
]);

const isFruit = (name) => hasAny(name, [
    'яблок', 'банан', 'груш', 'апельсин', 'мандарин', 'виноград', 'клубник', 'голубик',
    'нектарин', 'манго', 'ананас', 'финик', 'ягод'
]);

const isVeg = (name) => hasAny(name, [
    'помидор', 'огурец', 'перец', 'брокколи', 'цветн', 'кабач', 'капуст', 'шпинат', 'морков', 'лук', 'салат', 'гриб'
]);

const isSweet = (name) => hasAny(name, [
    'шоколад', 'печень', 'пирожн', 'пирог', 'десерт', 'морожен', 'конфет', 'мёд', 'мед ',
    'сахар', 'сироп', 'батончик', 'меренг', 'вафл', 'джем', 'варень', 'пастил', 'понч'
]);

const isSauce = (name) => hasAny(name, ['соус', 'кетчуп', 'аджик', 'ткемали', 'заправк', 'барбекю']);

const isSoup = (name) => hasAny(name, ['суп', 'окрошк']);

const isCanned = (name) => name.includes('консерв');
const isSmoked = (name) => hasAny(name, ['копч', 'вялен', 'сыровялен']);
const isSalted = (name) => hasAny(name, ['солён', 'солен', 'слабосол', 'квашен', 'марин']);
const isProtein = (name) => hasAny(name, ['protein', 'протеин']);
const isChips = (name) => hasAny(name, ['чипс', 'начос', 'палочки']);

const computeSodium = (nameRaw) => {
    const name = nameRaw.toLowerCase();
    if (exact.has(name)) return exact.get(name);

    if (isSauce(name)) return 900;
    if (isChips(name)) return 600;

    if (isSalted(name)) {
        if (isFish(name)) return 1200;
        if (isMeat(name)) return 1000;
        if (isVeg(name)) return 700;
        return 800;
    }

    if (isSmoked(name)) {
        if (isFish(name)) return 1000;
        if (isMeat(name)) return 900;
        return 700;
    }

    if (isCanned(name)) {
        if (isFish(name)) return 450;
        return 400;
    }

    if (isMeat(name)) {
        if (hasAny(name, ['колбас', 'сосиск', 'ветчин'])) return 1000;
        if (hasAny(name, ['котлет', 'паштет', 'карпаччо', 'холодец'])) return 600;
        return 80;
    }

    if (isFish(name)) return 90;

    if (isDairy(name)) {
        if (name.includes('творожный сыр')) return 350;
        if (name.includes('сыр') && !name.includes('творог')) return 700;
        if (name.includes('творог')) return 45;
        if (name.includes('йогурт')) return 55;
        if (name.includes('молоко') || name.includes('кефир')) return 50;
        if (name.includes('сливк') || name.includes('сметан')) return 40;
        if (name.includes('масло сливоч')) return 15;
    }

    if (isBread(name)) {
        if (name.includes('хлебц')) return 350;
        return 450;
    }

    if (isGrain(name)) return 5;

    if (isSoup(name)) return 300;

    if (isVeg(name)) {
        if (hasAny(name, ['на гриле', 'на пару', 'отварн', 'туш'])) return 30;
        return 10;
    }

    if (isFruit(name)) {
        if (hasAny(name, ['суш', 'изюм', 'кураг', 'финик'])) return 10;
        return 1;
    }

    if (isSweet(name)) {
        if (isProtein(name)) return 150;
        return 80;
    }

    if (isProtein(name)) return 150;

    return 50;
};

const updates = [];
const stats = new Map();

for (const line of lines) {
    if (line.toLowerCase().startsWith('id\t')) continue;
    const [id, name] = line.split('\t');
    if (!id || !name) continue;
    const sodium = computeSodium(name);
    const safeId = id.trim();
    updates.push(`UPDATE shared_products SET sodium100 = ${sodium} WHERE id = '${safeId}';`);
    stats.set(sodium, (stats.get(sodium) || 0) + 1);
}

const header = `-- Auto-generated sodium100 update (${new Date().toISOString()})\n`;
const footer = '\n-- Summary\n' + Array.from(stats.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([sodium, count]) => `-- ${sodium}: ${count}`)
    .join('\n') + '\n';

const out = header + updates.join('\n') + footer;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, out, 'utf8');
console.log(`Generated ${updates.length} UPDATE statements -> ${outputPath}`);