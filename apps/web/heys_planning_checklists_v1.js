// heys_planning_checklists_v1.js — checklist preset registry and rebuild engine

(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const Planning = HEYS.Planning = HEYS.Planning || {};
    const Checklists = Planning.Checklists = Planning.Checklists || {};

    const SEA_TENT_PRESET_ID = 'sea-tent-camping';
    const SEA_TENT_PRESET_TITLE = 'Поездка на море в палатках';
    const DEFAULT_CHILD_AGE = 7;
    const DEFAULT_DAY_TEMP = 27;
    const DEFAULT_NIGHT_TEMP = 18;
    const DAY_TEMP_MIN = 5;
    const DAY_TEMP_MAX = 45;
    const NIGHT_TEMP_MIN = -5;
    const NIGHT_TEMP_MAX = 35;

    const SEA_TENT_GROUPS = [
        'Документы и деньги',
        'Палаточный лагерь',
        'Ремонт и инструменты',
        'Спальные вещи',
        'Кухня и вода',
        'Еда',
        'Одежда и пляж',
        'Гигиена',
        'Аптечка',
        'Электрика и связь',
        'Безопасность у воды',
        'Безопасность и дети',
        'Досуг у моря',
    ];

    const MOUNTAIN_PRESET_ID = 'mountain-trip';
    const MOUNTAIN_PRESET_TITLE = 'Поездка в горы';

    const MOUNTAIN_GROUPS = [
        'Документы и деньги',
        'Навигация и маршрут',
        'Рюкзак и снаряжение',
        'Палаточный лагерь',
        'Спальные вещи',
        'Кухня и вода',
        'Еда и перекусы',
        'Одежда (слои)',
        'Обувь',
        'Гигиена',
        'Аптечка',
        'Электрика и связь',
        'Снег и лёд',
        'Безопасность в горах',
        'Дети в горах',
        'Досуг',
    ];

    const SEA_HOTEL_PRESET_ID = 'sea-hotel';
    const SEA_HOTEL_PRESET_TITLE = 'Поездка на море в отеле';

    const SEA_HOTEL_GROUPS = [
        'Документы и поездка',
        'Деньги и связь',
        'Пляж и море',
        'Одежда',
        'Обувь',
        'Гигиена и косметика',
        'Аптечка',
        'Техника и зарядки',
        'Еда и напитки',
        'Дети',
        'Развлечения',
        'Перед выходом из дома',
    ];

    const CITY_RENT_PRESET_ID = 'city-apartment';
    const CITY_RENT_PRESET_TITLE = 'Поездка в другой город, аренда квартиры';

    const CITY_RENT_GROUPS = [
        'Документы и поездка',
        'Деньги и связь',
        'Одежда',
        'Обувь',
        'Гигиена',
        'Аптечка',
        'Техника и зарядки',
        'Кухня и продукты',
        'Квартира и заселение',
        'Прогулки и город',
        'Дети',
        'Развлечения',
        'Перед выходом из дома',
    ];

    const CITY_HOTEL_PRESET_ID = 'city-hotel';
    const CITY_HOTEL_PRESET_TITLE = 'Поездка в другой город, отель';

    const CITY_HOTEL_GROUPS = [
        'Документы и поездка',
        'Деньги и связь',
        'Одежда',
        'Обувь',
        'Гигиена и косметика',
        'Аптечка',
        'Техника и зарядки',
        'Отель и заселение',
        'Прогулки и город',
        'Еда и перекусы',
        'Дети',
        'Развлечения',
        'Перед выходом из дома',
    ];

    function clampCount(value, min, max) {
        const next = Math.round(Number(value) || 0);
        return Math.max(min, Math.min(max, next));
    }

    function item(id, group, text, quantity, note) {
        return { id, group, text, quantity, note };
    }

    function pluralPeople(count, one, few, many) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    function formatChildAge(age) {
        const safeAge = clampCount(age, 0, 17);
        if (safeAge === 0) return 'до 1 года';
        return safeAge + ' ' + pluralPeople(safeAge, 'год', 'года', 'лет');
    }

    function formatChildAgeInline(age) {
        const safeAge = clampCount(age, 0, 17);
        if (safeAge === 0) return 'до 1';
        if (safeAge >= 5) return safeAge + ' лет';
        return safeAge + ' ' + pluralPeople(safeAge, 'год', 'года', 'лет');
    }

    function clampTemp(value, fallback, min, max) {
        const num = Math.round(Number(value));
        if (!Number.isFinite(num)) return fallback;
        return Math.max(min, Math.min(max, num));
    }

    function clampDayTemp(value) {
        return clampTemp(value, DEFAULT_DAY_TEMP, DAY_TEMP_MIN, DAY_TEMP_MAX);
    }

    function clampNightTemp(value) {
        return clampTemp(value, DEFAULT_NIGHT_TEMP, NIGHT_TEMP_MIN, NIGHT_TEMP_MAX);
    }

    function formatTemp(value) {
        const num = Math.round(Number(value) || 0);
        return (num > 0 ? '+' : '') + num + '°';
    }

    // Дневная t делит сборку на 4 диапазона: жара / тепло / прохладно / холодно.
    function getDayTempBand(dayTemp) {
        if (dayTemp >= 30) return 'hot';
        if (dayTemp >= 22) return 'warm';
        if (dayTemp >= 15) return 'cool';
        return 'cold';
    }

    // Ночная t — отдельные 4 диапазона: тёплая / мягкая / прохладная / холодная ночь.
    function getNightTempBand(nightTemp) {
        if (nightTemp >= 20) return 'warm';
        if (nightTemp >= 12) return 'mild';
        if (nightTemp >= 5) return 'cool';
        return 'cold';
    }

    function formatTempSummary(dayTemp, nightTemp) {
        return 'днём ' + formatTemp(dayTemp) + ' · ночью ' + formatTemp(nightTemp);
    }

    function normalizeSeaTentFacilities(options) {
        const source = options && typeof options === 'object' ? options : {};
        return {
            hasOutlet: source.hasOutlet === true,
            hasShower: source.hasShower === true,
        };
    }

    function formatUtilitySummary(hasOutlet, hasShower) {
        return (hasOutlet ? 'есть розетка' : 'без розетки')
            + ' · '
            + (hasShower ? 'есть душ' : 'без душа');
    }

    function normalizeChecklistGroupName(value) {
        return String(value || '').trim() || 'Общее';
    }

    function getChecklistCustomGroups(checklist) {
        const source = Array.isArray(checklist?.customGroups) ? checklist.customGroups : [];
        const seen = new Set();
        return source.reduce((groups, value) => {
            const group = normalizeChecklistGroupName(value);
            const key = group.toLocaleLowerCase('ru-RU');
            if (!seen.has(key)) {
                seen.add(key);
                groups.push(group);
            }
            return groups;
        }, []);
    }

    function normalizeChildAges(children, childAges) {
        const childCount = clampCount(children, 0, 12);
        const source = Array.isArray(childAges) ? childAges : [];
        const result = [];
        for (let index = 0; index < childCount; index += 1) {
            result.push(clampCount(source[index] ?? DEFAULT_CHILD_AGE, 0, 17));
        }
        return result;
    }

    function countChildAges(childAges, minAge, maxAge) {
        return normalizeChildAges(Array.isArray(childAges) ? childAges.length : 0, childAges)
            .filter((age) => age >= minAge && age <= maxAge).length;
    }

    function childAgesSummary(childAges) {
        const ages = normalizeChildAges(Array.isArray(childAges) ? childAges.length : 0, childAges);
        if (!ages.length) return '';
        return ages.map(formatChildAge).join(', ');
    }

    function buildSeaTentChecklistPreset(adults, children, childAges, dayTemp, nightTemp, options) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
        const facilities = normalizeSeaTentFacilities(options);
        const hasOutlet = facilities.hasOutlet;
        const hasShower = facilities.hasShower;
        const people = adultCount + childCount;
        const hasChildren = childCount > 0;
        const babyCount = countChildAges(ages, 0, 2);
        const preschoolCount = countChildAges(ages, 3, 6);
        const schoolCount = countChildAges(ages, 7, 12);
        const teenCount = countChildAges(ages, 13, 17);
        const smallChildCount = babyCount + preschoolCount;
        const under12Count = babyCount + preschoolCount + schoolCount;
        const safeDayTemp = clampDayTemp(dayTemp);
        const safeNightTemp = clampNightTemp(nightTemp);
        const dayBand = getDayTempBand(safeDayTemp);
        const nightBand = getNightTempBand(safeNightTemp);
        const sleepBagNote = nightBand === 'warm' ? 'лёгкие, можно вкладыш'
            : nightBand === 'cool' ? 'с запасом по теплу'
                : nightBand === 'cold' ? 'зимние или демисезонные'
                    : null;
        const items = [
            item('docs-passports', 'Документы и деньги', 'Паспорта или документы', people + ' шт.'),
            item('docs-medical', 'Документы и деньги', 'Медицинские полисы', people + ' шт.'),
            item('docs-cash', 'Документы и деньги', 'Наличные мелкими купюрами', '1 запас'),
            item('docs-booking', 'Документы и деньги', 'Бронь, маршрут, контакты лагеря', '1 комплект'),
            item('docs-route-offline', 'Документы и деньги', 'Офлайн-карты, координаты лагеря, телефоны служб', '1 комплект'),
            item('docs-car', 'Документы и деньги', 'Права, СТС, страховка, пропуск или парковка', 'по ситуации'),

            item('camp-tent', 'Палаточный лагерь', 'Палатка по вместимости', people + ' мест'),
            item('camp-groundsheet', 'Палаточный лагерь', 'Подложка под палатку', '1 шт.'),
            item('camp-awning', 'Палаточный лагерь', 'Тент от солнца и дождя', '1 шт.'),
            item('camp-pegs', 'Палаточный лагерь', 'Колышки, оттяжки, запасная верёвка', '1 набор'),
            item('camp-hammer', 'Палаточный лагерь', 'Молоток или киянка', '1 шт.'),
            item('camp-table', 'Палаточный лагерь', 'Складной стол', people > 4 ? '2 шт.' : '1 шт.'),
            item('camp-chairs', 'Палаточный лагерь', 'Складные стулья', people + ' шт.'),
            item('camp-bags', 'Палаточный лагерь', 'Гермомешки или плотные пакеты', Math.max(2, Math.ceil(people / 2)) + ' шт.'),
            item('camp-clothesline', 'Палаточный лагерь', 'Верёвка для сушки и прищепки', '1 набор'),
            item('camp-test-gear', 'Палаточный лагерь', 'Проверить палатку, горелку и фонари до выезда', '1 раз'),

            item('repair-multitool', 'Ремонт и инструменты', 'Мультитул или складной нож', '1 шт.'),
            item('repair-tape', 'Ремонт и инструменты', 'Армированный скотч и изолента', '1 набор'),
            item('repair-tent-mat', 'Ремонт и инструменты', 'Ремкомплект палатки и ковриков', '1 набор'),
            item('repair-cord', 'Ремонт и инструменты', 'Запасной шнур, карабины, стяжки', '1 набор'),

            item('sleep-bags', 'Спальные вещи', 'Спальные мешки', people + ' шт.', sleepBagNote),
            item('sleep-mats', 'Спальные вещи', 'Коврики или самонадувающиеся маты', people + ' шт.'),
            item('sleep-pillows', 'Спальные вещи', 'Подушки или наволочки под одежду', people + ' шт.'),
            item('sleep-blankets', 'Спальные вещи', 'Тёплые пледы', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
            item('sleep-dry-clothes', 'Спальные вещи', 'Сухой комплект для сна', people + ' комплектов'),
            item('sleep-earplugs', 'Спальные вещи', 'Беруши и маска для сна', Math.max(1, Math.ceil(people / 2)) + ' наборов'),

            item('kitchen-stove', 'Кухня и вода', 'Газовая плитка или горелка', '1 шт.'),
            item('kitchen-gas', 'Кухня и вода', 'Газовые баллоны', Math.max(2, Math.ceil(people / 2)) + ' шт.'),
            item('kitchen-fire', 'Кухня и вода', 'Зажигалка и спички в гермопакете', '2 шт.'),
            item('kitchen-pot', 'Кухня и вода', 'Котелок или кастрюля', people > 4 ? '2 шт.' : '1 шт.'),
            item('kitchen-pan', 'Кухня и вода', 'Сковорода', '1 шт.'),
            item('kitchen-dishes', 'Кухня и вода', 'Миска, кружка, приборы', people + ' наборов'),
            item('kitchen-knife', 'Кухня и вода', 'Нож, доска, открывалка', '1 набор'),
            item('kitchen-water', 'Кухня и вода', 'Питьевая вода на дорогу и первый день', Math.max(5, people * 3) + ' л'),
            item('kitchen-canisters', 'Кухня и вода', 'Канистры для воды', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
            item('kitchen-cooler', 'Кухня и вода', 'Термосумка или холодильник', '1 шт.'),
            item('kitchen-filter', 'Кухня и вода', 'Фильтр или таблетки для воды', 'по месту'),
            item('kitchen-wash', 'Кухня и вода', 'Губка, средство для посуды, кухонное полотенце', '1 набор'),
            item('kitchen-containers', 'Кухня и вода', 'Контейнеры, зип-пакеты, фольга', '1 набор'),

            item('food-breakfast', 'Еда', 'Завтраки: крупы, хлопья, чай', 'по плану дней'),
            item('food-main', 'Еда', 'Основная еда: консервы, паста, крупы', 'по плану дней'),
            item('food-snacks', 'Еда', 'Перекусы в дорогу и на пляж', people + ' порций/день'),
            item('food-spices', 'Еда', 'Соль, специи, масло', '1 набор'),
            item('food-extra-day', 'Еда', 'Запас еды на один день', '1 запас'),
            item('food-trash-bags', 'Еда', 'Пакеты для мусора', '1 рулон'),

            item('clothes-swim', 'Одежда и пляж', 'Купальные вещи', people + ' комплектов'),
            item('clothes-hats', 'Одежда и пляж', 'Головные уборы от солнца', people + ' шт.'),
            item('clothes-sunglasses', 'Одежда и пляж', 'Солнцезащитные очки', people + ' шт.'),
            item('clothes-sun-layer', 'Одежда и пляж', 'Лёгкая одежда с длинным рукавом от солнца', people + ' шт.'),
            item('clothes-wind', 'Одежда и пляж', 'Ветровки или лёгкие куртки', people + ' шт.'),
            item('clothes-rain', 'Одежда и пляж', 'Дождевики или пончо', people + ' шт.'),
            item('clothes-warm', 'Одежда и пляж', 'Тёплый слой на вечер', people + ' комплектов'),
            item('clothes-shoes', 'Одежда и пляж', 'Сандалии и закрытая обувь', people + ' пар'),
            item('clothes-water-shoes', 'Одежда и пляж', 'Обувь для камней и воды', people + ' пар'),
            item('clothes-towels', 'Одежда и пляж', 'Пляжные полотенца', people + ' шт.'),
            item('clothes-wet-bag', 'Одежда и пляж', 'Мешок для мокрых вещей', '1–2 шт.'),

            item('hygiene-sunscreen', 'Гигиена', 'Солнцезащитный крем', hasChildren ? 'взрослый + детский' : '1 шт.'),
            item('hygiene-lip-spf', 'Гигиена', 'Бальзам для губ SPF', '1 шт.'),
            item('hygiene-repellent', 'Гигиена', 'Средство от насекомых', hasChildren ? 'взрослое + детское' : '1 шт.'),
            item('hygiene-sanitizer', 'Гигиена', 'Антисептик для рук', '1–2 шт.'),
            item('hygiene-wipes', 'Гигиена', 'Влажные салфетки', hasChildren ? '2 пачки' : '1 пачка'),
            item('hygiene-paper', 'Гигиена', 'Туалетная бумага', '1 рулон/день'),
            item('hygiene-soap', 'Гигиена', 'Мыло, зубные щётки, паста', people + ' наборов'),
            item('hygiene-shower', 'Гигиена', 'Полотенце для душа', people + ' шт.'),
            item('hygiene-camp-toilet', 'Гигиена', 'Пакеты или лопатка для санитарной зоны', '1 набор'),

            item('firstaid-personal', 'Аптечка', 'Личные лекарства', 'по назначению'),
            item('firstaid-antiseptic', 'Аптечка', 'Антисептик, пластыри, бинт', '1 набор'),
            item('firstaid-blisters', 'Аптечка', 'Пластыри от мозолей', '1 набор'),
            item('firstaid-gloves-tape', 'Аптечка', 'Перчатки, медицинская лента, эластичный бинт', '1 набор'),
            item('firstaid-tweezers', 'Аптечка', 'Пинцет, ножницы, булавки', '1 набор'),
            item('firstaid-pain', 'Аптечка', 'Обезболивающее и жаропонижающее', '1 набор'),
            item('firstaid-allergy', 'Аптечка', 'Антигистаминное средство', '1 упаковка'),
            item('firstaid-ors', 'Аптечка', 'Средство для регидратации', '1 упаковка'),
            item('firstaid-burns', 'Аптечка', 'Средство после ожогов и солнца', '1 шт.'),
            item('firstaid-saline', 'Аптечка', 'Физраствор для промывания глаз и ран', '1 флакон'),
            item('firstaid-blanket', 'Аптечка', 'Термопокрывало', '1 шт.'),
            item('firstaid-thermometer', 'Аптечка', 'Термометр', '1 шт.'),

            item('electric-cables', 'Электрика и связь', 'Зарядные кабели и адаптеры', '1 набор'),
            item('electric-car-charger', 'Электрика и связь', 'Автомобильная зарядка или разветвитель', '1 шт.'),
            item('electric-lamps', 'Электрика и связь', 'Фонари налобные или ручные', people + ' шт.'),
            item('electric-batteries', 'Электрика и связь', 'Запасные батарейки', '1 набор'),
            item('electric-drybag', 'Электрика и связь', 'Гермочехол для телефона', Math.max(1, adultCount) + ' шт.'),

            item('water-safety-rules', 'Безопасность у воды', 'Зоны купания, флаги и точки встречи', '1 план'),
            item('water-safety-whistle', 'Безопасность у воды', 'Свисток или яркий сигнал для берега', '1 шт.'),
            item('water-safety-watch', 'Безопасность у воды', 'Очередность взрослых у воды', '1 план'),
            item('water-safety-lifejacket-adult', 'Безопасность у воды', 'Жилет для неуверенного пловца', 'по ситуации'),

            item('sea-mat', 'Досуг у моря', 'Пляжный коврик или покрывало', '1–2 шт.'),
            item('sea-mask', 'Досуг у моря', 'Маски или очки для плавания', people + ' шт.'),
            item('sea-games', 'Досуг у моря', 'Карты, книга, настольная игра', '1–2 шт.'),
        ];

        if (hasOutlet) {
            items.push(
                item('electric-camp-string-lights', 'Электрика и связь', 'Гирлянда для освещения лагеря', '1 шт.'),
                item('electric-extension', 'Электрика и связь', 'Удлинитель 10–20 м и тройник', '1 комплект'),
                item('electric-surge-protector', 'Электрика и связь', 'Сетевой фильтр или влагозащитный переходник', '1 шт.'),
                item('electric-outlet-cooling', 'Электрика и связь', 'Сетевой вентилятор или портативный кондиционер', 'по желанию'),
            );
        } else {
            items.push(
                item('electric-powerbanks', 'Электрика и связь', 'Пауэрбанки', Math.max(1, adultCount) + ' шт.'),
                item('electric-solar', 'Электрика и связь', 'Солнечная панель или зарядная станция', 'по ситуации'),
                item('electric-rechargeable-camp-light', 'Электрика и связь', 'Аккумуляторная лампа или гирлянда на батарейках', '1 шт.'),
            );
        }

        if (hasShower) {
            items.push(
                item('hygiene-shower-shoes', 'Гигиена', 'Шлёпки для душа', people + ' пар'),
                item('hygiene-shower-bag', 'Гигиена', 'Душевой набор в подвесной косметичке', '1 набор'),
            );
        } else {
            items.push(
                item('hygiene-portable-shower', 'Гигиена', 'Портативный душ или насос-душ', '1 шт.'),
                item('hygiene-shower-shelter', 'Гигиена', 'Душевая палатка или ширма', '1 шт.'),
                item('hygiene-biodegradable-soap', 'Гигиена', 'Биоразлагаемое средство для мытья', '1 шт.'),
                item('kitchen-shower-water', 'Кухня и вода', 'Канистра для душевой воды', '1 шт.'),
            );
        }

        if (hasChildren) {
            items.push(
                item('child-clothes', 'Одежда и пляж', 'Детские сменные комплекты', (childCount * 2) + ' комплектов'),
                item('child-sleep', 'Спальные вещи', 'Детский плед или любимая вещь для сна', childCount + ' шт.'),
                item('child-food', 'Еда', 'Детское питание и привычные перекусы', childCount + ' набора'),
                item('child-hygiene', 'Гигиена', 'Детские салфетки и мягкое средство для душа', '1 набор'),
                item('child-fever', 'Аптечка', 'Детское жаропонижающее по возрасту', '1 упаковка'),
                item('child-shade', 'Безопасность и дети', 'Запасная панама и лёгкая футболка от солнца', childCount + ' комплектов'),
                item('child-life-jacket', 'Безопасность у воды', 'Детский спасательный жилет по размеру', childCount + ' шт.'),
            );

            if (under12Count > 0) {
                items.push(item('child-id', 'Безопасность и дети', 'Браслет или карточка с телефоном взрослого', under12Count + ' шт.'));
            }

            if (smallChildCount > 0) {
                items.push(
                    item('child-shade-zone-small', 'Безопасность и дети', 'Тень для детской зоны у воды', '1 место'),
                    item('child-sand-toys', 'Досуг у моря', 'Ведёрко, лопатка, игрушки для песка', '1 набор'),
                    item('child-night-light', 'Спальные вещи', 'Ночник или маленький фонарь для ребёнка', '1 шт.'),
                );
            }

            if (babyCount > 0) {
                items.push(
                    item('child-baby-diapers', 'Гигиена', 'Подгузники и плавательные подгузники', babyCount + ' запас'),
                    item('child-baby-cream', 'Гигиена', 'Крем под подгузник и детский солнцезащитный крем', '1 набор'),
                    item('child-baby-food', 'Еда', 'Смесь, пюре, каши или привычное питание', babyCount + ' запас'),
                    item('child-baby-bottles', 'Кухня и вода', 'Бутылочки, поильник, ёршик', babyCount + ' набор'),
                    item('child-baby-sleep', 'Спальные вещи', 'Дорожная кроватка, кокон или бортики', babyCount + ' место'),
                    item('child-baby-carrier', 'Палаточный лагерь', 'Слинг, переноска или лёгкая коляска', '1 шт.'),
                    item('child-baby-bug-net', 'Безопасность и дети', 'Москитная сетка на коляску или переноску', '1 шт.'),
                    item('child-baby-firstaid', 'Аптечка', 'Детские дозировки лекарств и шприц-дозатор', '1 набор'),
                );
            }

            if (preschoolCount > 0) {
                items.push(
                    item('child-preschool-potty', 'Гигиена', 'Горшок или дорожная накладка', '1 шт.'),
                    item('child-preschool-clothes', 'Одежда и пляж', 'Запасные трусы, носки, лёгкие шорты', preschoolCount + ' комплекта'),
                    item('child-preschool-calm', 'Досуг у моря', 'Раскраски, наклейки, тихие занятия', preschoolCount + ' набора'),
                    item('child-preschool-snacks', 'Еда', 'Порционные перекусы без готовки', preschoolCount + ' запас'),
                );
            }

            if (schoolCount > 0) {
                items.push(
                    item('child-school-backpack', 'Безопасность и дети', 'Маленький рюкзак с водой и перекусом', schoolCount + ' шт.'),
                    item('child-school-aquashoes', 'Одежда и пляж', 'Аквашузы или обувь для камней', schoolCount + ' пар'),
                    item('child-school-mask', 'Досуг у моря', 'Маска или очки для плавания по размеру', schoolCount + ' шт.'),
                    item('child-school-games', 'Досуг у моря', 'Книга, карты, фрисби или мяч', '1 набор'),
                );
            }

            if (teenCount > 0) {
                items.push(
                    item('child-teen-docs', 'Документы и деньги', 'Копия документов и контакты взрослых', teenCount + ' комплектов'),
                    item('child-teen-hygiene', 'Гигиена', 'Личная косметичка подростка', teenCount + ' наборов'),
                    item('child-teen-power', 'Электрика и связь', 'Личный кабель/пауэрбанк для телефона', teenCount + ' наборов'),
                    item('child-teen-plan', 'Безопасность и дети', 'Точки встречи и правила связи', '1 план'),
                );
            }
        }

        // Дневная температура — список пересобирается мгновенно при переходе диапазона.
        if (dayBand === 'hot') {
            items.push(
                item('heat-extra-water', 'Кухня и вода', 'Дополнительный запас питьевой воды на жару', Math.max(4, people * 2) + ' л'),
                item('heat-electrolytes', 'Еда', 'Электролиты, изотоники или регидрон', people + ' порций/день'),
                item('heat-cooling', 'Одежда и пляж', 'Охлаждающее полотенце или термальный спрей', people + ' шт.'),
                item('heat-beach-shade', 'Безопасность у воды', 'Пляжный зонт или тент от солнца', '1 шт.'),
                item('heat-ice-packs', 'Кухня и вода', 'Аккумуляторы холода для термосумки', Math.max(2, Math.ceil(people / 2)) + ' шт.'),
                item('heat-fan', 'Электрика и связь', hasOutlet ? 'Сетевой вентилятор или портативный кондиционер' : 'Портативный вентилятор на аккумуляторе', '1 шт.'),
            );
        } else if (dayBand === 'cool') {
            items.push(
                item('cool-fleece', 'Одежда и пляж', 'Тёплая кофта или флис на день', people + ' шт.'),
                item('cool-pants', 'Одежда и пляж', 'Длинные штаны или брюки', people + ' шт.'),
            );
        } else if (dayBand === 'cold') {
            items.push(
                item('cold-jacket', 'Одежда и пляж', 'Утеплённая куртка', people + ' шт.'),
                item('cold-hat-gloves', 'Одежда и пляж', 'Шапка и перчатки на день', people + ' комплектов'),
                item('cold-pants', 'Одежда и пляж', 'Тёплые или термоштаны', people + ' шт.'),
                item('cold-thermos', 'Кухня и вода', 'Термос для горячих напитков', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
                item('cold-hot-drinks', 'Еда', 'Чай, какао или горячие напитки', '1 набор'),
            );
        }

        // Ночная температура — отдельная сборка сна/тепла на ночь.
        if (nightBand === 'warm') {
            items.push(
                item('night-warm-liner', 'Спальные вещи', 'Лёгкий вкладыш или простыня вместо тёплого спальника', people + ' шт.'),
                item('night-warm-bugs', 'Спальные вещи', 'Фумигатор или спираль от комаров на ночь', '1 набор'),
            );
        } else if (nightBand === 'cool') {
            items.push(
                item('night-cool-thermal', 'Спальные вещи', 'Термобельё или тёплая одежда для сна', people + ' комплектов'),
                item('night-cool-socks', 'Спальные вещи', 'Тёплые носки и шапочка для сна', people + ' комплектов'),
            );
        } else if (nightBand === 'cold') {
            items.push(
                item('night-cold-thermal', 'Спальные вещи', 'Термобельё для сна', people + ' комплектов'),
                item('night-cold-insulated-mat', 'Спальные вещи', 'Утеплённые коврики с запасом по теплу', people + ' шт.'),
                item('night-cold-hot-bottle', 'Спальные вещи', 'Грелка или бутылка под горячую воду', people + ' шт.'),
                item('night-cold-extra-blanket', 'Спальные вещи', 'Дополнительные тёплые одеяла', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
                item('night-cold-socks', 'Спальные вещи', 'Тёплые носки и шапочка для сна', people + ' комплектов'),
            );
        }

        return {
            id: SEA_TENT_PRESET_ID,
            title: SEA_TENT_PRESET_TITLE,
            audienceLabel: adultCount + ' ' + pluralPeople(adultCount, 'взрослый', 'взрослых', 'взрослых')
                + (childCount > 0
                    ? ' · ' + childCount + ' ' + pluralPeople(childCount, 'ребёнок', 'ребёнка', 'детей') + ' (' + childAgesSummary(ages) + ')'
                    : ''),
            childAges: ages,
            dayTemp: safeDayTemp,
            nightTemp: safeNightTemp,
            hasOutlet,
            hasShower,
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            utilityLabel: formatUtilitySummary(hasOutlet, hasShower),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function normalizeMountainConditions(options) {
        const source = options && typeof options === 'object' ? options : {};
        return {
            hasShelter: source.hasShelter === true,
            hasSnow: source.hasSnow === true,
        };
    }

    function formatMountainUtilitySummary(hasShelter, hasSnow) {
        return (hasShelter ? 'ночёвка в приюте' : 'ночёвка в палатке')
            + ' · '
            + (hasSnow ? 'снег и лёд' : 'без снега');
    }

    function buildMountainChecklistPreset(adults, children, childAges, dayTemp, nightTemp, options) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
        const conditions = normalizeMountainConditions(options);
        const hasShelter = conditions.hasShelter;
        const hasSnow = conditions.hasSnow;
        const people = adultCount + childCount;
        const hasChildren = childCount > 0;
        const babyCount = countChildAges(ages, 0, 2);
        const preschoolCount = countChildAges(ages, 3, 6);
        const schoolCount = countChildAges(ages, 7, 12);
        const teenCount = countChildAges(ages, 13, 17);
        const smallChildCount = babyCount + preschoolCount;
        const under12Count = babyCount + preschoolCount + schoolCount;
        const safeDayTemp = clampDayTemp(dayTemp);
        const safeNightTemp = clampNightTemp(nightTemp);
        const dayBand = getDayTempBand(safeDayTemp);
        const nightBand = getNightTempBand(safeNightTemp);
        const sleepBagNote = nightBand === 'warm' ? 'лёгкий, можно вкладыш'
            : nightBand === 'cool' ? 'с запасом по теплу'
                : nightBand === 'cold' ? 'зимний или экспедиционный'
                    : null;
        const items = [
            item('mtn-docs-id', 'Документы и деньги', 'Паспорта или документы', people + ' шт.'),
            item('mtn-docs-insurance', 'Документы и деньги', 'Страховка с покрытием гор и спасработ', people + ' шт.'),
            item('mtn-docs-permits', 'Документы и деньги', 'Пропуска в погранзону или нацпарк, регистрация маршрута', '1 комплект'),
            item('mtn-docs-cash', 'Документы и деньги', 'Наличные мелкими купюрами', '1 запас'),
            item('mtn-docs-route-card', 'Документы и деньги', 'Маршрутный лист, контакты МЧС и спасслужбы', '1 комплект'),
            item('mtn-docs-emergency-card', 'Документы и деньги', 'Карточка с экстренными контактами и аллергиями', people + ' шт.'),

            item('mtn-nav-map', 'Навигация и маршрут', 'Бумажная карта района и компас', '1 комплект'),
            item('mtn-nav-gps', 'Навигация и маршрут', 'Навигатор или офлайн-карты в телефоне', '1 шт.'),
            item('mtn-nav-route-plan', 'Навигация и маршрут', 'Трек маршрута, точки воды и ночёвок', '1 план'),
            item('mtn-nav-weather', 'Навигация и маршрут', 'Прогноз погоды и план отхода при непогоде', '1 план'),
            item('mtn-nav-whistle', 'Навигация и маршрут', 'Свисток и сигнальное зеркало', people + ' шт.'),

            item('mtn-pack-backpack', 'Рюкзак и снаряжение', 'Треккинговый рюкзак по объёму', people + ' шт.'),
            item('mtn-pack-raincover', 'Рюкзак и снаряжение', 'Накидка от дождя на рюкзак', people + ' шт.'),
            item('mtn-pack-poles', 'Рюкзак и снаряжение', 'Треккинговые палки', people + ' пар'),
            item('mtn-pack-drybags', 'Рюкзак и снаряжение', 'Гермомешки или плотные пакеты для вещей', Math.max(2, Math.ceil(people / 2)) + ' шт.'),
            item('mtn-pack-daypack', 'Рюкзак и снаряжение', 'Лёгкий штурмовой рюкзак для радиалок', Math.max(1, adultCount) + ' шт.'),
            item('mtn-pack-knife', 'Рюкзак и снаряжение', 'Мультитул или складной нож', '1 шт.'),
            item('mtn-pack-repair', 'Рюкзак и снаряжение', 'Ремнабор: стяжки, скотч, нитки, пряжки', '1 набор'),

            item('mtn-sleep-bag', 'Спальные вещи', 'Спальный мешок по сезону', people + ' шт.', sleepBagNote),
            item('mtn-sleep-liner', 'Спальные вещи', 'Вкладыш в спальник', people + ' шт.'),

            item('mtn-kitchen-stove', 'Кухня и вода', 'Горелка и газовые баллоны', '1 комплект'),
            item('mtn-kitchen-fire', 'Кухня и вода', 'Зажигалка и спички в гермопакете', '2 шт.'),
            item('mtn-kitchen-pot', 'Кухня и вода', 'Котелок или набор посуды для готовки', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
            item('mtn-kitchen-dishes', 'Кухня и вода', 'Кружка, миска, ложка', people + ' наборов'),
            item('mtn-kitchen-water-bottles', 'Кухня и вода', 'Бутылки или гидратор для воды', Math.max(1, people) + ' шт.'),
            item('mtn-kitchen-water-treat', 'Кухня и вода', 'Фильтр или таблетки для очистки воды', '1 набор'),
            item('mtn-kitchen-wash', 'Кухня и вода', 'Губка и биоразлагаемое средство для посуды', '1 набор'),

            item('mtn-food-main', 'Еда и перекусы', 'Раскладка по дням: завтраки и ужины', 'по плану дней'),
            item('mtn-food-trail', 'Еда и перекусы', 'Перекусы на ходу: орехи, батончики, сухофрукты', people + ' порций/день'),
            item('mtn-food-hot-drinks', 'Еда и перекусы', 'Чай, какао, изотоник в порошке', '1 набор'),
            item('mtn-food-emergency', 'Еда и перекусы', 'Аварийный запас еды на один день', '1 запас'),
            item('mtn-food-spices', 'Еда и перекусы', 'Соль, специи, сахар', '1 набор'),
            item('mtn-food-trash', 'Еда и перекусы', 'Пакеты для мусора — выносим всё с собой', '1 рулон'),

            item('mtn-clothes-base', 'Одежда (слои)', 'Термобельё, влагоотводящее', people + ' комплектов'),
            item('mtn-clothes-mid', 'Одежда (слои)', 'Флис или утеплённая кофта', people + ' шт.'),
            item('mtn-clothes-shell', 'Одежда (слои)', 'Мембранная куртка от дождя и ветра', people + ' шт.'),
            item('mtn-clothes-rain-pants', 'Одежда (слои)', 'Мембранные штаны', people + ' шт.'),
            item('mtn-clothes-trek-pants', 'Одежда (слои)', 'Треккинговые штаны', people + ' шт.'),
            item('mtn-clothes-hat-sun', 'Одежда (слои)', 'Кепка или панама от солнца', people + ' шт.'),
            item('mtn-clothes-buff', 'Одежда (слои)', 'Бафф или шарф', people + ' шт.'),
            item('mtn-clothes-socks', 'Одежда (слои)', 'Треккинговые носки с запасом', (people * 2) + ' пар'),
            item('mtn-clothes-sunglasses', 'Одежда (слои)', 'Солнцезащитные очки, горные', people + ' шт.'),

            item('mtn-shoes-boots', 'Обувь', 'Треккинговые ботинки, разношенные', people + ' пар'),
            item('mtn-shoes-camp', 'Обувь', 'Лёгкая сменная обувь для лагеря', people + ' пар'),

            item('mtn-hyg-sunscreen', 'Гигиена', 'Солнцезащитный крем SPF 50', hasChildren ? 'взрослый + детский' : '1 шт.'),
            item('mtn-hyg-lip', 'Гигиена', 'Бальзам для губ SPF', people + ' шт.'),
            item('mtn-hyg-toiletries', 'Гигиена', 'Зубная щётка, паста, мыло', people + ' наборов'),
            item('mtn-hyg-wipes', 'Гигиена', 'Влажные салфетки', hasChildren ? '2 пачки' : '1 пачка'),
            item('mtn-hyg-sanitizer', 'Гигиена', 'Антисептик для рук', '1–2 шт.'),
            item('mtn-hyg-towel', 'Гигиена', 'Быстросохнущее полотенце', people + ' шт.'),
            item('mtn-hyg-tp', 'Гигиена', 'Туалетная бумага и пакеты для выноса', '1 запас'),
            item('mtn-hyg-repellent', 'Гигиена', 'Средство от насекомых и клещей', '1 шт.'),

            item('mtn-aid-personal', 'Аптечка', 'Личные лекарства', 'по назначению'),
            item('mtn-aid-wound', 'Аптечка', 'Антисептик, пластыри, бинт', '1 набор'),
            item('mtn-aid-blisters', 'Аптечка', 'Пластыри от мозолей', '1 набор'),
            item('mtn-aid-tape', 'Аптечка', 'Тейп, эластичный бинт, лейкопластырь', '1 набор'),
            item('mtn-aid-pain', 'Аптечка', 'Обезболивающее и жаропонижающее', '1 набор'),
            item('mtn-aid-gastro', 'Аптечка', 'Средства от ЖКТ и регидратация', '1 набор'),
            item('mtn-aid-allergy', 'Аптечка', 'Антигистаминное средство', '1 упаковка'),
            item('mtn-aid-blanket', 'Аптечка', 'Спасательное термопокрывало', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
            item('mtn-aid-tweezers', 'Аптечка', 'Пинцет, ножницы, клещ-щипцы', '1 набор'),

            item('mtn-elec-headlamp', 'Электрика и связь', 'Налобный фонарь', people + ' шт.'),
            item('mtn-elec-batteries', 'Электрика и связь', 'Запасные батарейки или аккумуляторы', '1 набор'),
            item('mtn-elec-powerbank', 'Электрика и связь', 'Пауэрбанк', Math.max(1, adultCount) + ' шт.'),
            item('mtn-elec-cables', 'Электрика и связь', 'Кабели зарядки в гермопакете', '1 набор'),
            item('mtn-elec-phone-drybag', 'Электрика и связь', 'Гермочехол для телефона', Math.max(1, adultCount) + ' шт.'),

            item('mtn-safety-lead', 'Безопасность в горах', 'Назначить ответственного за аптечку и связь', '1 план'),
            item('mtn-safety-checkin', 'Безопасность в горах', 'Контрольные точки и время выхода на связь', '1 план'),
            item('mtn-safety-turnaround', 'Безопасность в горах', 'Контрольное время разворота', '1 план'),
            item('mtn-safety-group-rules', 'Безопасность в горах', 'Правило «не растягиваться» и замыкающий', '1 план'),

            item('mtn-leisure-camera', 'Досуг', 'Камера или телефон для съёмки', 'по желанию'),
            item('mtn-leisure-book', 'Досуг', 'Книга, карты или мини-игра', '1–2 шт.'),
            item('mtn-leisure-binoculars', 'Досуг', 'Бинокль', 'по желанию'),
        ];

        // Тип ночёвки: приют/база против палатки — переключает весь блок сна и лагеря.
        if (hasShelter) {
            items.push(
                item('mtn-hut-booking', 'Документы и деньги', 'Бронь места в приюте или на базе', '1 подтверждение'),
                item('mtn-hut-cash-extras', 'Документы и деньги', 'Деньги на питание и душ в приюте', '1 запас'),
                item('mtn-hut-sleep-sheet', 'Спальные вещи', 'Простыня-вкладыш по правилам приюта', people + ' шт.'),
                item('mtn-hut-earplugs', 'Спальные вещи', 'Беруши и маска для сна в общей комнате', people + ' наборов'),
                item('mtn-hut-indoor-shoes', 'Обувь', 'Сменка или тапки для приюта', people + ' пар'),
                item('mtn-hut-padlock', 'Рюкзак и снаряжение', 'Замок для шкафчика или вещей', '1 шт.'),
            );
        } else {
            items.push(
                item('mtn-tent', 'Палаточный лагерь', 'Палатка по вместимости', people + ' мест'),
                item('mtn-tent-footprint', 'Палаточный лагерь', 'Подложка или футпринт под палатку', '1 шт.'),
                item('mtn-tent-pegs', 'Палаточный лагерь', 'Колышки, оттяжки, запасная верёвка', '1 набор'),
                item('mtn-tent-repair', 'Палаточный лагерь', 'Ремкомплект палатки и стоек', '1 набор'),
                item('mtn-tent-camp-light', 'Палаточный лагерь', 'Кемпинговый фонарь для палатки', '1 шт.'),
                item('mtn-tent-mat', 'Спальные вещи', 'Коврик-каремат или самонадувающийся мат', people + ' шт.'),
                item('mtn-tent-pillow', 'Спальные вещи', 'Надувная подушка или под одежду', people + ' шт.'),
                item('mtn-tent-sit-pad', 'Спальные вещи', 'Сидушка-пенка', people + ' шт.'),
            );
        }

        // Снег и лёд на маршруте — отдельный блок технического снаряжения.
        if (hasSnow) {
            items.push(
                item('mtn-snow-traction', 'Снег и лёд', 'Кошки или микроспайки по ботинкам', people + ' пар'),
                item('mtn-snow-iceaxe', 'Снег и лёд', 'Ледоруб или треккинговый айсбайл', Math.max(1, adultCount) + ' шт.'),
                item('mtn-snow-gaiters', 'Снег и лёд', 'Высокие гамаши от снега', people + ' пар'),
                item('mtn-snow-goggles', 'Снег и лёд', 'Горные очки или маска от снега и UV', people + ' шт.'),
                item('mtn-snow-helmet', 'Снег и лёд', 'Каска от камнепада и льда', 'по ситуации'),
                item('mtn-snow-warm-boots', 'Снег и лёд', 'Утеплённые ботинки или бахилы', people + ' пар'),
                item('mtn-snow-hand-warmers', 'Снег и лёд', 'Химические грелки для рук и ног', (people * 2) + ' шт.'),
                item('mtn-snow-avalanche', 'Снег и лёд', 'Бипер, лавинный щуп и лопата на лавиноопасных участках', 'по ситуации'),
            );
            if (!hasShelter) {
                items.push(item('mtn-snow-shovel-tent', 'Снег и лёд', 'Лопата для площадки под палатку на снегу', '1 шт.'));
            }
        }

        if (hasChildren) {
            items.push(
                item('mtn-child-clothes', 'Одежда (слои)', 'Детские сменные комплекты по слоям', (childCount * 2) + ' комплектов'),
                item('mtn-child-shell', 'Одежда (слои)', 'Детская мембранная куртка и штаны', childCount + ' комплектов'),
                item('mtn-child-boots', 'Обувь', 'Детские треккинговые ботинки, разношенные', childCount + ' пар'),
                item('mtn-child-sun', 'Гигиена', 'Детский SPF, панама, очки', '1 набор'),
                item('mtn-child-snacks', 'Еда и перекусы', 'Привычные детские перекусы', childCount + ' набора'),
                item('mtn-child-fever', 'Аптечка', 'Детское жаропонижающее по возрасту', '1 упаковка'),
                item('mtn-child-warm-sleep', 'Спальные вещи', 'Детский тёплый спальник или плед', childCount + ' шт.'),
                item('mtn-child-pace-plan', 'Безопасность в горах', 'План темпа и привалов под детей', '1 план'),
            );

            if (under12Count > 0) {
                items.push(item('mtn-child-id', 'Дети в горах', 'Браслет или карточка с телефоном взрослого', under12Count + ' шт.'));
            }

            if (smallChildCount > 0) {
                items.push(
                    item('mtn-child-calm', 'Досуг', 'Тихие занятия и любимая игрушка на привал', '1 набор'),
                    item('mtn-child-extra-clothes', 'Одежда (слои)', 'Запасная сухая одежда — промокнет и испачкается', smallChildCount + ' комплектов'),
                );
            }

            if (babyCount > 0) {
                items.push(
                    item('mtn-baby-carrier', 'Рюкзак и снаряжение', 'Эрго-рюкзак или хайкинг-переноска для малыша', '1 шт.'),
                    item('mtn-baby-carrier-cover', 'Дети в горах', 'Дождевик и козырёк от солнца на переноску', '1 шт.'),
                    item('mtn-baby-warm', 'Одежда (слои)', 'Тёплый комбинезон и шапочка', babyCount + ' комплектов'),
                    item('mtn-baby-diapers', 'Гигиена', 'Подгузники и пакеты для выноса', babyCount + ' запас'),
                    item('mtn-baby-food', 'Еда и перекусы', 'Смесь, пюре или привычное питание', babyCount + ' запас'),
                    item('mtn-baby-firstaid', 'Аптечка', 'Детские дозировки лекарств и шприц-дозатор', '1 набор'),
                );
            }

            if (preschoolCount > 0) {
                items.push(
                    item('mtn-preschool-potty', 'Гигиена', 'Горшок-накладка или решение для туалета', '1 шт.'),
                    item('mtn-preschool-snacks', 'Еда и перекусы', 'Порционные перекусы без готовки', preschoolCount + ' запас'),
                    item('mtn-preschool-clothes', 'Одежда (слои)', 'Запасные трусы, носки, лёгкие штаны', preschoolCount + ' комплекта'),
                );
            }

            if (schoolCount > 0) {
                items.push(
                    item('mtn-school-daypack', 'Рюкзак и снаряжение', 'Маленький рюкзак с водой и перекусом', schoolCount + ' шт.'),
                    item('mtn-school-poles', 'Рюкзак и снаряжение', 'Детские треккинговые палки', schoolCount + ' пар'),
                    item('mtn-school-tasks', 'Досуг', 'Маршрутные задания и наблюдения за природой', schoolCount + ' шт.'),
                );
            }

            if (teenCount > 0) {
                items.push(
                    item('mtn-teen-docs', 'Документы и деньги', 'Копия документов и контакты взрослых', teenCount + ' комплектов'),
                    item('mtn-teen-pack', 'Рюкзак и снаряжение', 'Свой рюкзак с частью общего груза', teenCount + ' шт.'),
                    item('mtn-teen-power', 'Электрика и связь', 'Личный кабель или пауэрбанк', teenCount + ' наборов'),
                    item('mtn-teen-plan', 'Безопасность в горах', 'Точки встречи и правила связи', '1 план'),
                );
            }
        }

        // Дневная температура — список пересобирается при переходе диапазона.
        if (dayBand === 'hot') {
            items.push(
                item('mtn-heat-water', 'Кухня и вода', 'Дополнительный запас питьевой воды на жару', Math.max(4, people * 2) + ' л'),
                item('mtn-heat-electrolytes', 'Еда и перекусы', 'Электролиты или изотоники', people + ' порций/день'),
                item('mtn-heat-sun-sleeves', 'Одежда (слои)', 'Лёгкие рукава или бафф от солнца', people + ' шт.'),
                item('mtn-heat-cooling', 'Гигиена', 'Охлаждающее полотенце или термальный спрей', people + ' шт.'),
            );
        } else if (dayBand === 'cool') {
            items.push(
                item('mtn-cool-extra-mid', 'Одежда (слои)', 'Дополнительный тёплый слой на день', people + ' шт.'),
                item('mtn-cool-gloves', 'Одежда (слои)', 'Тёплые перчатки на день', people + ' пар'),
            );
        } else if (dayBand === 'cold') {
            items.push(
                item('mtn-cold-insulated-jacket', 'Одежда (слои)', 'Утеплённая куртка: пуховка или синтепон', people + ' шт.'),
                item('mtn-cold-warm-hat', 'Одежда (слои)', 'Тёплая шапка и варежки', people + ' комплектов'),
                item('mtn-cold-thermo-pants', 'Одежда (слои)', 'Утеплённые или термоштаны', people + ' шт.'),
                item('mtn-cold-hand-warmers', 'Одежда (слои)', 'Химические грелки для рук', (people * 2) + ' шт.'),
                item('mtn-cold-thermos-hot', 'Кухня и вода', 'Термос с горячим питьём', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
            );
        }

        // Ночная температура — отдельная сборка сна и тепла на ночь.
        if (nightBand === 'warm') {
            items.push(item('mtn-night-warm-liner', 'Спальные вещи', 'Лёгкий вкладыш вместо тёплого спальника', people + ' шт.'));
        } else if (nightBand === 'cool') {
            items.push(
                item('mtn-night-cool-thermal', 'Спальные вещи', 'Термобельё для сна', people + ' комплектов'),
                item('mtn-night-cool-socks', 'Спальные вещи', 'Тёплые носки и шапочка для сна', people + ' комплектов'),
            );
        } else if (nightBand === 'cold') {
            items.push(
                item('mtn-night-cold-thermal', 'Спальные вещи', 'Тёплое термобельё для сна', people + ' комплектов'),
                item('mtn-night-cold-insulated-mat', 'Спальные вещи', 'Утеплённый коврик с запасом по теплу', people + ' шт.'),
                item('mtn-night-cold-hot-bottle', 'Спальные вещи', 'Грелка или бутылка под горячую воду', people + ' шт.'),
                item('mtn-night-cold-socks', 'Спальные вещи', 'Тёплые носки и шапочка для сна', people + ' комплектов'),
                item('mtn-night-cold-extra-bag', 'Спальные вещи', 'Дополнительное одеяло или второй вкладыш', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
            );
        }

        return {
            id: MOUNTAIN_PRESET_ID,
            title: MOUNTAIN_PRESET_TITLE,
            audienceLabel: adultCount + ' ' + pluralPeople(adultCount, 'взрослый', 'взрослых', 'взрослых')
                + (childCount > 0
                    ? ' · ' + childCount + ' ' + pluralPeople(childCount, 'ребёнок', 'ребёнка', 'детей') + ' (' + childAgesSummary(ages) + ')'
                    : ''),
            childAges: ages,
            dayTemp: safeDayTemp,
            nightTemp: safeNightTemp,
            hasShelter,
            hasSnow,
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            utilityLabel: formatMountainUtilitySummary(hasShelter, hasSnow),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function normalizeSeaHotelOptions(options) {
        const source = options && typeof options === 'object' ? options : {};
        return {
            allInclusive: source.allInclusive === true,
            flying: source.flying === true,
        };
    }

    function formatSeaHotelUtilitySummary(allInclusive, flying) {
        return (allInclusive ? 'всё включено' : 'питание сами')
            + ' · '
            + (flying ? 'летим' : 'на машине');
    }

    function buildSeaHotelChecklistPreset(adults, children, childAges, dayTemp, nightTemp, options) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
        const opts = normalizeSeaHotelOptions(options);
        const allInclusive = opts.allInclusive;
        const flying = opts.flying;
        const people = adultCount + childCount;
        const hasChildren = childCount > 0;
        const babyCount = countChildAges(ages, 0, 2);
        const preschoolCount = countChildAges(ages, 3, 6);
        const schoolCount = countChildAges(ages, 7, 12);
        const teenCount = countChildAges(ages, 13, 17);
        const under12Count = babyCount + preschoolCount + schoolCount;
        const safeDayTemp = clampDayTemp(dayTemp);
        const safeNightTemp = clampNightTemp(nightTemp);
        const dayBand = getDayTempBand(safeDayTemp);
        const nightBand = getNightTempBand(safeNightTemp);
        const items = [
            item('hotel-docs-passport', 'Документы и поездка', 'Паспорта или загранпаспорта', people + ' шт.'),
            item('hotel-docs-tickets', 'Документы и поездка', 'Билеты, ваучеры или маршрут', '1 комплект'),
            item('hotel-docs-booking', 'Документы и поездка', 'Бронь отеля и трансфера', '1 подтверждение'),
            item('hotel-docs-insurance', 'Документы и поездка', 'Медицинская страховка', people + ' шт.'),
            item('hotel-docs-copies', 'Документы и поездка', 'Копии документов отдельно от оригиналов', '1 комплект'),
            item('hotel-docs-meds-list', 'Документы и поездка', 'Список лекарств и важные контакты', '1 шт.'),

            item('hotel-money-cash', 'Деньги и связь', 'Наличные и банковские карты', '1 запас'),
            item('hotel-money-currency', 'Деньги и связь', 'Местная валюта или план обмена', 'по ситуации'),
            item('hotel-money-sim', 'Деньги и связь', 'SIM, eSIM или роуминг', Math.max(1, adultCount) + ' шт.'),
            item('hotel-money-safe', 'Деньги и связь', 'Спрятать ценности в сейф номера', '1 раз'),

            item('hotel-beach-swimwear', 'Пляж и море', 'Купальники и плавки', (people * 2) + ' комплектов'),
            item('hotel-beach-towel', 'Пляж и море', 'Пляжное полотенце, если отель не выдаёт', people + ' шт.'),
            item('hotel-beach-bag', 'Пляж и море', 'Пляжная сумка', '1–2 шт.'),
            item('hotel-beach-sunglasses', 'Пляж и море', 'Солнцезащитные очки', people + ' шт.'),
            item('hotel-beach-hat', 'Пляж и море', 'Головные уборы от солнца', people + ' шт.'),
            item('hotel-beach-flipflops', 'Пляж и море', 'Шлёпки или пляжная обувь', people + ' пар'),
            item('hotel-beach-mask', 'Пляж и море', 'Маски или очки для плавания', people + ' шт.'),
            item('hotel-beach-waterproof', 'Пляж и море', 'Гермочехол или непромокаемый кошелёк', Math.max(1, adultCount) + ' шт.'),

            item('hotel-clothes-day', 'Одежда', 'Лёгкая повседневная одежда', 'по числу дней'),
            item('hotel-clothes-evening', 'Одежда', 'Наряд на вечер или ресторан', people + ' комплектов'),
            item('hotel-clothes-underwear', 'Одежда', 'Бельё и носки', 'по числу дней'),
            item('hotel-clothes-light-jacket', 'Одежда', 'Лёгкая кофта или ветровка на вечер', people + ' шт.'),
            item('hotel-clothes-cover-up', 'Одежда', 'Парео или туника поверх купальника', 'по ситуации'),

            item('hotel-shoes-walk', 'Обувь', 'Удобная обувь для прогулок', people + ' пар'),
            item('hotel-shoes-evening', 'Обувь', 'Обувь под вечерний образ', people + ' пар'),

            item('hotel-hyg-sunscreen', 'Гигиена и косметика', 'Солнцезащитный крем SPF', hasChildren ? 'взрослый + детский' : '1–2 шт.'),
            item('hotel-hyg-aftersun', 'Гигиена и косметика', 'Средство после загара', '1 шт.'),
            item('hotel-hyg-lip', 'Гигиена и косметика', 'Бальзам для губ SPF', people + ' шт.'),
            item('hotel-hyg-toiletries', 'Гигиена и косметика', 'Зубные щётки, паста, дезодорант', people + ' наборов'),
            item('hotel-hyg-cosmetics', 'Гигиена и косметика', 'Косметичка', '1 шт.'),
            item('hotel-hyg-hairbrush', 'Гигиена и косметика', 'Расчёска и резинки', '1 набор'),
            item('hotel-hyg-feminine', 'Гигиена и косметика', 'Средства личной гигиены', '1 запас'),
            item('hotel-hyg-repellent', 'Гигиена и косметика', 'Средство от насекомых', '1 шт.'),

            item('hotel-aid-personal', 'Аптечка', 'Личные лекарства', 'по назначению'),
            item('hotel-aid-basic', 'Аптечка', 'Пластыри, антисептик, бинт', '1 набор'),
            item('hotel-aid-pain', 'Аптечка', 'Обезболивающее и жаропонижающее', '1 набор'),
            item('hotel-aid-gastro', 'Аптечка', 'От расстройства ЖКТ и регидратация', '1 набор'),
            item('hotel-aid-allergy', 'Аптечка', 'Антигистаминное средство', '1 упаковка'),
            item('hotel-aid-sunburn', 'Аптечка', 'Средство от солнечных ожогов', '1 шт.'),

            item('hotel-tech-charger', 'Техника и зарядки', 'Зарядки для телефонов', people + ' шт.'),
            item('hotel-tech-powerbank', 'Техника и зарядки', 'Пауэрбанк', Math.max(1, adultCount) + ' шт.'),
            item('hotel-tech-adapter', 'Техника и зарядки', 'Переходник на местные розетки', '1–2 шт.'),
            item('hotel-tech-headphones', 'Техника и зарядки', 'Наушники', people + ' шт.'),
            item('hotel-tech-camera', 'Техника и зарядки', 'Камера или экшн-камера', 'по желанию'),

            item('hotel-fun-book', 'Развлечения', 'Книга или журнал', '1–2 шт.'),
            item('hotel-fun-games', 'Развлечения', 'Карты или настольная игра', '1 шт.'),

            item('hotel-home-windows', 'Перед выходом из дома', 'Закрыть окна, воду, газ', '1 раз'),
            item('hotel-home-appliances', 'Перед выходом из дома', 'Выключить технику из розеток', '1 раз'),
            item('hotel-home-fridge', 'Перед выходом из дома', 'Убрать скоропорт, вынести мусор', '1 раз'),
            item('hotel-home-keys', 'Перед выходом из дома', 'Ключи и запасные доверенному', '1 раз'),
            item('hotel-home-plants-pets', 'Перед выходом из дома', 'Цветы и питомцы', 'по ситуации'),
        ];

        // Питание: всё включено против самостоятельного — переключает блок еды.
        if (allInclusive) {
            items.push(
                item('hotel-ai-wristband', 'Документы и поездка', 'Уточнить браслет «всё включено» и часы баров', '1 раз'),
                item('hotel-ai-bottle', 'Еда и напитки', 'Многоразовая бутылка под напитки из бара', people + ' шт.'),
            );
        } else {
            items.push(
                item('hotel-food-water', 'Еда и напитки', 'Вода и многоразовые бутылки', people + ' шт.'),
                item('hotel-food-breakfast', 'Еда и напитки', 'Быстрые завтраки, если нет питания', 'по плану дней'),
                item('hotel-food-snacks', 'Еда и напитки', 'Перекусы в дорогу и в номер', people + ' порций/день'),
                item('hotel-food-utensils', 'Еда и напитки', 'Дорожные приборы, кружка, складной нож', '1 набор'),
                item('hotel-food-coffee', 'Еда и напитки', 'Чай, кофе, кипятильник — уточнить чайник в номере', '1 набор'),
            );
        }

        // Транспорт: самолёт против машины.
        if (flying) {
            items.push(
                item('hotel-fly-boarding', 'Документы и поездка', 'Онлайн-регистрация и посадочные', people + ' шт.'),
                item('hotel-fly-carryon', 'Документы и поездка', 'Ручная кладь: ценное, лекарства, сменка', people + ' шт.'),
                item('hotel-fly-luggage', 'Документы и поездка', 'Бирки на чемоданы и весы для багажа', '1 набор'),
                item('hotel-fly-liquids', 'Гигиена и косметика', 'Жидкости до 100 мл в прозрачном пакете', '1 набор'),
                item('hotel-fly-comfort', 'Развлечения', 'В дорогу: подушка для шеи, маска, беруши', people + ' наборов'),
            );
        } else {
            items.push(
                item('hotel-car-docs', 'Документы и поездка', 'Права, СТС, страховка, грин-карта', '1 комплект'),
                item('hotel-car-charger', 'Техника и зарядки', 'Автозарядка и держатель телефона', '1 шт.'),
                item('hotel-car-emergency', 'Аптечка', 'Автоаптечка, знак, жилет, трос', '1 комплект'),
                item('hotel-car-cooler', 'Еда и напитки', 'Термосумка для еды и напитков', '1 шт.'),
                item('hotel-car-entertainment', 'Развлечения', 'Музыка, аудиокниги, игры в дорогу', '1 набор'),
            );
        }

        if (hasChildren) {
            items.push(
                item('hotel-child-clothes', 'Одежда', 'Детская одежда по числу дней', childCount + ' наборов'),
                item('hotel-child-swimwear', 'Пляж и море', 'Детские купальники и плавки', (childCount * 2) + ' комплектов'),
                item('hotel-child-life', 'Пляж и море', 'Нарукавники или жилет для бассейна и моря', childCount + ' шт.'),
                item('hotel-child-sun', 'Гигиена и косметика', 'Детский SPF, панама, очки', '1 набор'),
                item('hotel-child-snacks', 'Еда и напитки', 'Привычные детские перекусы', childCount + ' набора'),
                item('hotel-child-meds', 'Аптечка', 'Детские лекарства по возрасту', '1 набор'),
                item('hotel-child-toys', 'Развлечения', 'Игрушки и занятия в номер и на пляж', '1 набор'),
            );

            if (under12Count > 0) {
                items.push(item('hotel-child-id', 'Дети', 'Браслет или карточка с телефоном взрослого', under12Count + ' шт.'));
            }

            if (babyCount > 0) {
                items.push(
                    item('hotel-baby-diapers', 'Гигиена и косметика', 'Подгузники и плавательные подгузники', babyCount + ' запас'),
                    item('hotel-baby-food', 'Еда и напитки', 'Смесь, пюре или привычное питание', babyCount + ' запас'),
                    item('hotel-baby-cot', 'Документы и поездка', 'Уточнить детскую кроватку в отеле', '1 раз'),
                    item('hotel-baby-stroller', 'Дети', 'Лёгкая коляска или переноска', '1 шт.'),
                    item('hotel-baby-firstaid', 'Аптечка', 'Детские дозировки лекарств и шприц-дозатор', '1 набор'),
                );
            }

            if (preschoolCount > 0) {
                items.push(
                    item('hotel-preschool-potty', 'Гигиена и косметика', 'Горшок-накладка или решение для туалета', '1 шт.'),
                    item('hotel-preschool-calm', 'Развлечения', 'Тихие занятия в дорогу и на ужин', preschoolCount + ' набора'),
                );
            }

            if (schoolCount > 0) {
                items.push(
                    item('hotel-school-water-toys', 'Пляж и море', 'Маска, нарукавники, игрушки для воды', schoolCount + ' наборов'),
                    item('hotel-school-activities', 'Развлечения', 'Книги, наушники, планшет с играми', schoolCount + ' наборов'),
                );
            }

            if (teenCount > 0) {
                items.push(
                    item('hotel-teen-docs', 'Документы и поездка', 'Копия документов и контакты взрослых', teenCount + ' комплектов'),
                    item('hotel-teen-power', 'Техника и зарядки', 'Личный кабель и пауэрбанк', teenCount + ' наборов'),
                    item('hotel-teen-plan', 'Деньги и связь', 'Карманные деньги и правила связи', '1 план'),
                );
            }
        }

        // Дневная температура — пляжный климат.
        if (dayBand === 'hot') {
            items.push(
                item('hotel-heat-water', 'Еда и напитки', 'Питьевая вода в номер и на пляж', Math.max(4, people * 2) + ' л'),
                item('hotel-heat-electrolytes', 'Еда и напитки', 'Электролиты или изотоники', people + ' порций/день'),
                item('hotel-heat-cooling', 'Гигиена и косметика', 'Охлаждающий спрей или термальная вода', people + ' шт.'),
                item('hotel-heat-umbrella', 'Пляж и море', 'Пляжный зонт, если отель не выдаёт', 'по ситуации'),
            );
        } else if (dayBand === 'cool') {
            items.push(
                item('hotel-cool-layer', 'Одежда', 'Тёплая кофта или кардиган на вечер', people + ' шт.'),
                item('hotel-cool-pants', 'Одежда', 'Длинные брюки или джинсы', people + ' шт.'),
            );
        } else if (dayBand === 'cold') {
            items.push(
                item('hotel-cold-jacket', 'Одежда', 'Утеплённая куртка', people + ' шт.'),
                item('hotel-cold-warm', 'Одежда', 'Шапка, шарф, тёплая обувь', people + ' комплектов'),
            );
        }

        // Ночная температура — вечерняя и спальная одежда.
        if (nightBand === 'warm') {
            items.push(item('hotel-night-warm', 'Одежда', 'Лёгкая одежда для сна и вечера', people + ' комплектов'));
        } else if (nightBand === 'cool') {
            items.push(item('hotel-night-cool', 'Одежда', 'Тёплая пижама и кофта на вечер', people + ' комплектов'));
        } else if (nightBand === 'cold') {
            items.push(item('hotel-night-cold', 'Одежда', 'Тёплая пижама, носки, тёплый слой на вечер', people + ' комплектов'));
        }

        return {
            id: SEA_HOTEL_PRESET_ID,
            title: SEA_HOTEL_PRESET_TITLE,
            audienceLabel: adultCount + ' ' + pluralPeople(adultCount, 'взрослый', 'взрослых', 'взрослых')
                + (childCount > 0
                    ? ' · ' + childCount + ' ' + pluralPeople(childCount, 'ребёнок', 'ребёнка', 'детей') + ' (' + childAgesSummary(ages) + ')'
                    : ''),
            childAges: ages,
            dayTemp: safeDayTemp,
            nightTemp: safeNightTemp,
            allInclusive,
            flying,
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            utilityLabel: formatSeaHotelUtilitySummary(allInclusive, flying),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function normalizeCityRentOptions(options) {
        const source = options && typeof options === 'object' ? options : {};
        return {
            selfCooking: source.selfCooking === true,
            flying: source.flying === true,
        };
    }

    function formatCityRentUtilitySummary(selfCooking, flying) {
        return (selfCooking ? 'готовим сами' : 'едим вне дома')
            + ' · '
            + (flying ? 'летим' : 'на машине');
    }

    function buildCityRentChecklistPreset(adults, children, childAges, dayTemp, nightTemp, options) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
        const opts = normalizeCityRentOptions(options);
        const selfCooking = opts.selfCooking;
        const flying = opts.flying;
        const people = adultCount + childCount;
        const hasChildren = childCount > 0;
        const babyCount = countChildAges(ages, 0, 2);
        const preschoolCount = countChildAges(ages, 3, 6);
        const schoolCount = countChildAges(ages, 7, 12);
        const teenCount = countChildAges(ages, 13, 17);
        const under12Count = babyCount + preschoolCount + schoolCount;
        const safeDayTemp = clampDayTemp(dayTemp);
        const safeNightTemp = clampNightTemp(nightTemp);
        const dayBand = getDayTempBand(safeDayTemp);
        const nightBand = getNightTempBand(safeNightTemp);
        const items = [
            item('city-docs-id', 'Документы и поездка', 'Паспорта или документы', people + ' шт.'),
            item('city-docs-tickets', 'Документы и поездка', 'Билеты туда-обратно или маршрут', '1 комплект'),
            item('city-docs-booking', 'Документы и поездка', 'Бронь квартиры, адрес, контакт хозяина', '1 подтверждение'),
            item('city-docs-checkin', 'Документы и поездка', 'Инструкция по заселению и код от двери', '1 шт.'),
            item('city-docs-insurance', 'Документы и поездка', 'Страховка, если нужна', 'по ситуации'),
            item('city-docs-copies', 'Документы и поездка', 'Копии документов отдельно', '1 комплект'),

            item('city-money-cash', 'Деньги и связь', 'Наличные и банковские карты', '1 запас'),
            item('city-money-sim', 'Деньги и связь', 'SIM, eSIM или мобильный интернет', Math.max(1, adultCount) + ' шт.'),
            item('city-money-transit', 'Деньги и связь', 'Транспортная карта, приложения такси и метро', '1 набор'),
            item('city-money-deposit', 'Деньги и связь', 'Деньги на залог или депозит за квартиру', 'по ситуации'),

            item('city-clothes-day', 'Одежда', 'Повседневная одежда по числу дней', 'по числу дней'),
            item('city-clothes-underwear', 'Одежда', 'Бельё и носки', 'по числу дней'),
            item('city-clothes-evening', 'Одежда', 'Наряд для ресторана или театра', people + ' комплектов'),
            item('city-clothes-layer', 'Одежда', 'Кофта или джемпер на смену погоды', people + ' шт.'),
            item('city-clothes-rain', 'Одежда', 'Дождевик или зонт', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
            item('city-clothes-pajamas', 'Одежда', 'Пижама или одежда для сна', people + ' комплектов'),

            item('city-shoes-walk', 'Обувь', 'Удобная обувь для долгой ходьбы', people + ' пар'),
            item('city-shoes-evening', 'Обувь', 'Обувь под вечерний образ', people + ' пар'),
            item('city-shoes-home', 'Обувь', 'Тапочки или носки для квартиры', people + ' пар'),

            item('city-hyg-toiletries', 'Гигиена', 'Зубные щётки, паста, дезодорант', people + ' наборов'),
            item('city-hyg-shampoo', 'Гигиена', 'Шампунь, гель, мыло — квартира может не дать', '1 набор'),
            item('city-hyg-towel-check', 'Гигиена', 'Уточнить полотенца в квартире', '1 раз'),
            item('city-hyg-cosmetics', 'Гигиена', 'Косметичка', '1 шт.'),
            item('city-hyg-hair', 'Гигиена', 'Расчёска, фен — уточнить в квартире', '1 набор'),
            item('city-hyg-feminine', 'Гигиена', 'Средства личной гигиены', '1 запас'),
            item('city-hyg-tp', 'Гигиена', 'Туалетная бумага и салфетки на первый раз', '1 запас'),

            item('city-aid-personal', 'Аптечка', 'Личные лекарства', 'по назначению'),
            item('city-aid-basic', 'Аптечка', 'Пластыри, антисептик, бинт', '1 набор'),
            item('city-aid-pain', 'Аптечка', 'Обезболивающее и жаропонижающее', '1 набор'),
            item('city-aid-blisters', 'Аптечка', 'Пластыри от мозолей — много ходить', '1 набор'),
            item('city-aid-gastro', 'Аптечка', 'От ЖКТ и изжоги — другая еда', '1 набор'),
            item('city-aid-allergy', 'Аптечка', 'Антигистаминное средство', '1 упаковка'),

            item('city-tech-charger', 'Техника и зарядки', 'Зарядки для телефонов', people + ' шт.'),
            item('city-tech-powerbank', 'Техника и зарядки', 'Пауэрбанк для прогулок', Math.max(1, adultCount) + ' шт.'),
            item('city-tech-adapter', 'Техника и зарядки', 'Переходник или удлинитель', 'по ситуации'),
            item('city-tech-headphones', 'Техника и зарядки', 'Наушники', people + ' шт.'),
            item('city-tech-camera', 'Техника и зарядки', 'Камера', 'по желанию'),

            item('city-apt-checkin-time', 'Квартира и заселение', 'Согласовать время заселения и выезда', '1 раз'),
            item('city-apt-contact', 'Квартира и заселение', 'Сохранить контакт хозяина и инструкции офлайн', '1 раз'),
            item('city-apt-rules', 'Квартира и заселение', 'Уточнить правила: тишина, мусор, депозит', '1 раз'),
            item('city-apt-essentials', 'Квартира и заселение', 'Узнать, что есть: стиралка, посуда, фен', '1 раз'),

            item('city-walk-daybag', 'Прогулки и город', 'Городской рюкзак или сумка на день', Math.max(1, adultCount) + ' шт.'),
            item('city-walk-bottle', 'Прогулки и город', 'Многоразовая бутылка воды', people + ' шт.'),
            item('city-walk-map', 'Прогулки и город', 'Офлайн-карты и список мест', '1 набор'),
            item('city-walk-umbrella', 'Прогулки и город', 'Складной зонт', Math.max(1, Math.ceil(people / 2)) + ' шт.'),

            item('city-fun-tickets', 'Развлечения', 'Билеты в музеи и на события заранее', 'по плану'),
            item('city-fun-book', 'Развлечения', 'Книга или журнал в дорогу', '1–2 шт.'),
            item('city-fun-games', 'Развлечения', 'Карты или настолка на вечер в квартире', '1 шт.'),

            item('city-home-windows', 'Перед выходом из дома', 'Закрыть окна, воду, газ', '1 раз'),
            item('city-home-appliances', 'Перед выходом из дома', 'Выключить технику из розеток', '1 раз'),
            item('city-home-fridge', 'Перед выходом из дома', 'Убрать скоропорт, вынести мусор', '1 раз'),
            item('city-home-keys', 'Перед выходом из дома', 'Ключи и запасные доверенному', '1 раз'),
            item('city-home-plants-pets', 'Перед выходом из дома', 'Цветы и питомцы', 'по ситуации'),
        ];

        // Питание: готовим в квартире против еды вне дома.
        if (selfCooking) {
            items.push(
                item('city-cook-groceries', 'Кухня и продукты', 'Базовые продукты на первый день', '1 запас'),
                item('city-cook-spices', 'Кухня и продукты', 'Соль, перец, масло, чай или кофе', '1 набор'),
                item('city-cook-dish-soap', 'Кухня и продукты', 'Средство для посуды и губка — уточнить', '1 набор'),
                item('city-cook-containers', 'Кухня и продукты', 'Контейнеры и зип-пакеты для еды', '1 набор'),
                item('city-cook-bags', 'Кухня и продукты', 'Шопер или пакеты для продуктов', '1–2 шт.'),
            );
        } else {
            items.push(
                item('city-eatout-list', 'Прогулки и город', 'Список кафе и ресторанов рядом', '1 список'),
                item('city-eatout-reservations', 'Развлечения', 'Брони в популярные места заранее', 'по ситуации'),
                item('city-eatout-budget', 'Деньги и связь', 'Заложить бюджет на еду вне дома', '1 план'),
                item('city-eatout-breakfast', 'Кухня и продукты', 'Лёгкие перекусы и вода в квартиру на утро', people + ' порций'),
            );
        }

        // Транспорт: самолёт против машины или поезда.
        if (flying) {
            items.push(
                item('city-fly-boarding', 'Документы и поездка', 'Онлайн-регистрация и посадочные', people + ' шт.'),
                item('city-fly-carryon', 'Документы и поездка', 'Ручная кладь: ценное, лекарства, сменка', people + ' шт.'),
                item('city-fly-luggage', 'Документы и поездка', 'Весы для багажа и бирки на чемоданы', '1 набор'),
                item('city-fly-liquids', 'Гигиена', 'Жидкости до 100 мл в прозрачном пакете', '1 набор'),
                item('city-fly-comfort', 'Развлечения', 'В самолёт: подушка для шеи, маска, беруши', people + ' наборов'),
            );
        } else {
            items.push(
                item('city-car-docs', 'Документы и поездка', 'Права, СТС, страховка или билеты на поезд', '1 комплект'),
                item('city-car-nav', 'Прогулки и город', 'Навигатор и парковки в городе заранее', '1 набор'),
                item('city-car-snacks', 'Кухня и продукты', 'Перекусы и вода в дорогу', people + ' порций'),
                item('city-car-entertainment', 'Развлечения', 'Аудиокниги, музыка, игры в дорогу', '1 набор'),
            );
        }

        if (hasChildren) {
            items.push(
                item('city-child-clothes', 'Одежда', 'Детская одежда по числу дней', childCount + ' наборов'),
                item('city-child-shoes', 'Обувь', 'Удобная детская обувь для ходьбы', childCount + ' пар'),
                item('city-child-snacks', 'Кухня и продукты', 'Привычные перекусы и вода', childCount + ' набора'),
                item('city-child-meds', 'Аптечка', 'Детские лекарства по возрасту', '1 набор'),
                item('city-child-entertainment', 'Развлечения', 'Игры, планшет, книги в дорогу и квартиру', '1 набор'),
            );

            if (under12Count > 0) {
                items.push(item('city-child-id', 'Дети', 'Браслет или карточка с телефоном взрослого', under12Count + ' шт.'));
            }

            if (babyCount > 0) {
                items.push(
                    item('city-baby-diapers', 'Гигиена', 'Подгузники и салфетки', babyCount + ' запас'),
                    item('city-baby-food', 'Кухня и продукты', 'Смесь, пюре или привычное питание', babyCount + ' запас'),
                    item('city-baby-stroller', 'Дети', 'Коляска или переноска для города', '1 шт.'),
                    item('city-baby-carrier', 'Дети', 'Эрго-рюкзак для транспорта и музеев', '1 шт.'),
                    item('city-baby-cot', 'Квартира и заселение', 'Уточнить детскую кроватку в квартире', '1 раз'),
                    item('city-baby-firstaid', 'Аптечка', 'Детские дозировки лекарств и шприц-дозатор', '1 набор'),
                );
            }

            if (preschoolCount > 0) {
                items.push(
                    item('city-preschool-potty', 'Гигиена', 'Горшок-накладка или решение для туалета', '1 шт.'),
                    item('city-preschool-calm', 'Развлечения', 'Тихие занятия в дорогу и в кафе', preschoolCount + ' набора'),
                    item('city-preschool-clothes', 'Одежда', 'Запасная одежда', preschoolCount + ' комплекта'),
                );
            }

            if (schoolCount > 0) {
                items.push(
                    item('city-school-activities', 'Развлечения', 'Книги, наушники, планшет с играми', schoolCount + ' наборов'),
                    item('city-school-daypack', 'Прогулки и город', 'Маленький рюкзак с водой и перекусом', schoolCount + ' шт.'),
                );
            }

            if (teenCount > 0) {
                items.push(
                    item('city-teen-docs', 'Документы и поездка', 'Копия документов и контакты взрослых', teenCount + ' комплектов'),
                    item('city-teen-power', 'Техника и зарядки', 'Личный кабель и пауэрбанк', teenCount + ' наборов'),
                    item('city-teen-plan', 'Деньги и связь', 'Карманные деньги и правила связи', '1 план'),
                );
            }
        }

        // Дневная температура — городской климат, слои одежды.
        if (dayBand === 'hot') {
            items.push(
                item('city-heat-water', 'Прогулки и город', 'Бутылки воды на прогулки', people + ' шт.'),
                item('city-heat-sunscreen', 'Гигиена', 'Солнцезащитный крем и кепка', '1 набор'),
                item('city-heat-light-clothes', 'Одежда', 'Лёгкая дышащая одежда', people + ' комплектов'),
            );
        } else if (dayBand === 'cool') {
            items.push(
                item('city-cool-jacket', 'Одежда', 'Куртка или тёплая кофта на день', people + ' шт.'),
                item('city-cool-scarf', 'Одежда', 'Шарф и закрытая обувь', people + ' комплектов'),
            );
        } else if (dayBand === 'cold') {
            items.push(
                item('city-cold-coat', 'Одежда', 'Тёплое пальто или пуховик', people + ' шт.'),
                item('city-cold-hat-gloves', 'Одежда', 'Шапка, перчатки, шарф', people + ' комплектов'),
                item('city-cold-warm-shoes', 'Обувь', 'Тёплая непромокаемая обувь', people + ' пар'),
                item('city-cold-thermos', 'Прогулки и город', 'Термос для горячих напитков на прогулки', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
            );
        }

        // Ночная температура — вечерняя и спальная одежда.
        if (nightBand === 'warm') {
            items.push(item('city-night-warm', 'Одежда', 'Лёгкая одежда для сна и вечерних прогулок', people + ' комплектов'));
        } else if (nightBand === 'cool') {
            items.push(item('city-night-cool', 'Одежда', 'Тёплая пижама и кофта на вечер', people + ' комплектов'));
        } else if (nightBand === 'cold') {
            items.push(item('city-night-cold', 'Одежда', 'Тёплая пижама, носки, тёплый слой на вечер', people + ' комплектов'));
        }

        return {
            id: CITY_RENT_PRESET_ID,
            title: CITY_RENT_PRESET_TITLE,
            audienceLabel: adultCount + ' ' + pluralPeople(adultCount, 'взрослый', 'взрослых', 'взрослых')
                + (childCount > 0
                    ? ' · ' + childCount + ' ' + pluralPeople(childCount, 'ребёнок', 'ребёнка', 'детей') + ' (' + childAgesSummary(ages) + ')'
                    : ''),
            childAges: ages,
            dayTemp: safeDayTemp,
            nightTemp: safeNightTemp,
            selfCooking,
            flying,
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            utilityLabel: formatCityRentUtilitySummary(selfCooking, flying),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function normalizeCityHotelOptions(options) {
        const source = options && typeof options === 'object' ? options : {};
        return {
            breakfast: source.breakfast === true,
            flying: source.flying === true,
        };
    }

    function formatCityHotelUtilitySummary(breakfast, flying) {
        return (breakfast ? 'завтрак включён' : 'без завтрака')
            + ' · '
            + (flying ? 'летим' : 'на машине');
    }

    function buildCityHotelChecklistPreset(adults, children, childAges, dayTemp, nightTemp, options) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
        const opts = normalizeCityHotelOptions(options);
        const breakfast = opts.breakfast;
        const flying = opts.flying;
        const people = adultCount + childCount;
        const hasChildren = childCount > 0;
        const babyCount = countChildAges(ages, 0, 2);
        const preschoolCount = countChildAges(ages, 3, 6);
        const schoolCount = countChildAges(ages, 7, 12);
        const teenCount = countChildAges(ages, 13, 17);
        const under12Count = babyCount + preschoolCount + schoolCount;
        const safeDayTemp = clampDayTemp(dayTemp);
        const safeNightTemp = clampNightTemp(nightTemp);
        const dayBand = getDayTempBand(safeDayTemp);
        const nightBand = getNightTempBand(safeNightTemp);
        const items = [
            item('chotel-docs-id', 'Документы и поездка', 'Паспорта или документы', people + ' шт.'),
            item('chotel-docs-tickets', 'Документы и поездка', 'Билеты туда-обратно или маршрут', '1 комплект'),
            item('chotel-docs-booking', 'Документы и поездка', 'Бронь отеля и подтверждение', '1 подтверждение'),
            item('chotel-docs-insurance', 'Документы и поездка', 'Страховка, если нужна', 'по ситуации'),
            item('chotel-docs-copies', 'Документы и поездка', 'Копии документов отдельно', '1 комплект'),
            item('chotel-docs-meds-list', 'Документы и поездка', 'Список лекарств и важные контакты', '1 шт.'),

            item('chotel-money-cash', 'Деньги и связь', 'Наличные и банковские карты', '1 запас'),
            item('chotel-money-sim', 'Деньги и связь', 'SIM, eSIM или мобильный интернет', Math.max(1, adultCount) + ' шт.'),
            item('chotel-money-transit', 'Деньги и связь', 'Транспортная карта, приложения такси и метро', '1 набор'),
            item('chotel-money-tips', 'Деньги и связь', 'Мелочь на чаевые и гардероб', '1 запас'),

            item('chotel-clothes-day', 'Одежда', 'Повседневная одежда по числу дней', 'по числу дней'),
            item('chotel-clothes-underwear', 'Одежда', 'Бельё и носки', 'по числу дней'),
            item('chotel-clothes-evening', 'Одежда', 'Наряд для ресторана или театра', people + ' комплектов'),
            item('chotel-clothes-layer', 'Одежда', 'Кофта или джемпер на смену погоды', people + ' шт.'),
            item('chotel-clothes-rain', 'Одежда', 'Дождевик или зонт', Math.max(1, Math.ceil(people / 2)) + ' шт.'),
            item('chotel-clothes-pajamas', 'Одежда', 'Пижама или одежда для сна', people + ' комплектов'),

            item('chotel-shoes-walk', 'Обувь', 'Удобная обувь для долгой ходьбы', people + ' пар'),
            item('chotel-shoes-evening', 'Обувь', 'Обувь под вечерний образ', people + ' пар'),

            item('chotel-hyg-toiletries', 'Гигиена и косметика', 'Зубные щётки, паста, дезодорант', people + ' наборов'),
            item('chotel-hyg-cosmetics', 'Гигиена и косметика', 'Косметичка', '1 шт.'),
            item('chotel-hyg-hair', 'Гигиена и косметика', 'Расчёска, резинки, средства для волос', '1 набор'),
            item('chotel-hyg-feminine', 'Гигиена и косметика', 'Средства личной гигиены', '1 запас'),
            item('chotel-hyg-skincare', 'Гигиена и косметика', 'Уход за кожей и крем для рук', '1 набор'),

            item('chotel-aid-personal', 'Аптечка', 'Личные лекарства', 'по назначению'),
            item('chotel-aid-basic', 'Аптечка', 'Пластыри, антисептик, бинт', '1 набор'),
            item('chotel-aid-pain', 'Аптечка', 'Обезболивающее и жаропонижающее', '1 набор'),
            item('chotel-aid-blisters', 'Аптечка', 'Пластыри от мозолей — много ходить', '1 набор'),
            item('chotel-aid-gastro', 'Аптечка', 'От ЖКТ и изжоги — другая еда', '1 набор'),
            item('chotel-aid-allergy', 'Аптечка', 'Антигистаминное средство', '1 упаковка'),

            item('chotel-tech-charger', 'Техника и зарядки', 'Зарядки для телефонов', people + ' шт.'),
            item('chotel-tech-powerbank', 'Техника и зарядки', 'Пауэрбанк для прогулок', Math.max(1, adultCount) + ' шт.'),
            item('chotel-tech-adapter', 'Техника и зарядки', 'Переходник на местные розетки', '1–2 шт.'),
            item('chotel-tech-headphones', 'Техника и зарядки', 'Наушники', people + ' шт.'),
            item('chotel-tech-camera', 'Техника и зарядки', 'Камера', 'по желанию'),

            item('chotel-stay-checkin', 'Отель и заселение', 'Уточнить время заселения и выезда', '1 раз'),
            item('chotel-stay-early', 'Отель и заселение', 'Договориться о раннем заезде или хранении багажа', 'по ситуации'),
            item('chotel-stay-card', 'Отель и заселение', 'Взять визитку отеля с адресом', '1 шт.'),
            item('chotel-stay-safe', 'Отель и заселение', 'Спрятать ценности в сейф номера', '1 раз'),
            item('chotel-stay-laundry', 'Отель и заселение', 'Уточнить прачечную или химчистку', 'по ситуации'),

            item('chotel-walk-daybag', 'Прогулки и город', 'Городской рюкзак или сумка на день', Math.max(1, adultCount) + ' шт.'),
            item('chotel-walk-bottle', 'Прогулки и город', 'Многоразовая бутылка воды', people + ' шт.'),
            item('chotel-walk-map', 'Прогулки и город', 'Офлайн-карты и список мест', '1 набор'),
            item('chotel-walk-umbrella', 'Прогулки и город', 'Складной зонт', Math.max(1, Math.ceil(people / 2)) + ' шт.'),

            item('chotel-fun-tickets', 'Развлечения', 'Билеты в музеи и на события заранее', 'по плану'),
            item('chotel-fun-book', 'Развлечения', 'Книга или журнал в дорогу', '1–2 шт.'),

            item('chotel-home-windows', 'Перед выходом из дома', 'Закрыть окна, воду, газ', '1 раз'),
            item('chotel-home-appliances', 'Перед выходом из дома', 'Выключить технику из розеток', '1 раз'),
            item('chotel-home-fridge', 'Перед выходом из дома', 'Убрать скоропорт, вынести мусор', '1 раз'),
            item('chotel-home-keys', 'Перед выходом из дома', 'Ключи и запасные доверенному', '1 раз'),
            item('chotel-home-plants-pets', 'Перед выходом из дома', 'Цветы и питомцы', 'по ситуации'),
        ];

        // Питание: завтрак в отеле включён против самостоятельных завтраков.
        if (breakfast) {
            items.push(
                item('chotel-bf-hours', 'Отель и заселение', 'Уточнить часы завтрака в отеле', '1 раз'),
                item('chotel-bf-snacks', 'Еда и перекусы', 'Лёгкие перекусы на вечер', people + ' порций'),
            );
        } else {
            items.push(
                item('chotel-nobf-breakfast', 'Еда и перекусы', 'Завтраки или кафе рядом на утро', 'по плану дней'),
                item('chotel-nobf-snacks', 'Еда и перекусы', 'Перекусы и вода в номер и в дорогу', people + ' порций/день'),
                item('chotel-nobf-utensils', 'Еда и перекусы', 'Дорожные приборы, кружка, кипятильник', '1 набор'),
                item('chotel-nobf-coffee', 'Еда и перекусы', 'Чай, кофе — уточнить чайник в номере', '1 набор'),
            );
        }

        // Транспорт: самолёт против машины или поезда.
        if (flying) {
            items.push(
                item('chotel-fly-boarding', 'Документы и поездка', 'Онлайн-регистрация и посадочные', people + ' шт.'),
                item('chotel-fly-carryon', 'Документы и поездка', 'Ручная кладь: ценное, лекарства, сменка', people + ' шт.'),
                item('chotel-fly-luggage', 'Документы и поездка', 'Весы для багажа и бирки на чемоданы', '1 набор'),
                item('chotel-fly-liquids', 'Гигиена и косметика', 'Жидкости до 100 мл в прозрачном пакете', '1 набор'),
                item('chotel-fly-comfort', 'Развлечения', 'В самолёт: подушка для шеи, маска, беруши', people + ' наборов'),
            );
        } else {
            items.push(
                item('chotel-car-docs', 'Документы и поездка', 'Права, СТС, страховка или билеты на поезд', '1 комплект'),
                item('chotel-car-nav', 'Прогулки и город', 'Навигатор и парковки у отеля заранее', '1 набор'),
                item('chotel-car-snacks', 'Еда и перекусы', 'Перекусы и вода в дорогу', people + ' порций'),
                item('chotel-car-entertainment', 'Развлечения', 'Аудиокниги, музыка, игры в дорогу', '1 набор'),
            );
        }

        if (hasChildren) {
            items.push(
                item('chotel-child-clothes', 'Одежда', 'Детская одежда по числу дней', childCount + ' наборов'),
                item('chotel-child-shoes', 'Обувь', 'Удобная детская обувь для ходьбы', childCount + ' пар'),
                item('chotel-child-snacks', 'Еда и перекусы', 'Привычные перекусы и вода', childCount + ' набора'),
                item('chotel-child-meds', 'Аптечка', 'Детские лекарства по возрасту', '1 набор'),
                item('chotel-child-entertainment', 'Развлечения', 'Игры, планшет, книги в дорогу и в номер', '1 набор'),
            );

            if (under12Count > 0) {
                items.push(item('chotel-child-id', 'Дети', 'Браслет или карточка с телефоном взрослого', under12Count + ' шт.'));
            }

            if (babyCount > 0) {
                items.push(
                    item('chotel-baby-diapers', 'Гигиена и косметика', 'Подгузники и салфетки', babyCount + ' запас'),
                    item('chotel-baby-food', 'Еда и перекусы', 'Смесь, пюре или привычное питание', babyCount + ' запас'),
                    item('chotel-baby-cot', 'Отель и заселение', 'Уточнить детскую кроватку в отеле', '1 раз'),
                    item('chotel-baby-stroller', 'Дети', 'Коляска или переноска для города', '1 шт.'),
                    item('chotel-baby-carrier', 'Дети', 'Эрго-рюкзак для транспорта и музеев', '1 шт.'),
                    item('chotel-baby-firstaid', 'Аптечка', 'Детские дозировки лекарств и шприц-дозатор', '1 набор'),
                );
            }

            if (preschoolCount > 0) {
                items.push(
                    item('chotel-preschool-potty', 'Гигиена и косметика', 'Горшок-накладка или решение для туалета', '1 шт.'),
                    item('chotel-preschool-calm', 'Развлечения', 'Тихие занятия в дорогу и в кафе', preschoolCount + ' набора'),
                    item('chotel-preschool-clothes', 'Одежда', 'Запасная одежда', preschoolCount + ' комплекта'),
                );
            }

            if (schoolCount > 0) {
                items.push(
                    item('chotel-school-activities', 'Развлечения', 'Книги, наушники, планшет с играми', schoolCount + ' наборов'),
                    item('chotel-school-daypack', 'Прогулки и город', 'Маленький рюкзак с водой и перекусом', schoolCount + ' шт.'),
                );
            }

            if (teenCount > 0) {
                items.push(
                    item('chotel-teen-docs', 'Документы и поездка', 'Копия документов и контакты взрослых', teenCount + ' комплектов'),
                    item('chotel-teen-power', 'Техника и зарядки', 'Личный кабель и пауэрбанк', teenCount + ' наборов'),
                    item('chotel-teen-plan', 'Деньги и связь', 'Карманные деньги и правила связи', '1 план'),
                );
            }
        }

        // Дневная температура — городской климат, слои одежды.
        if (dayBand === 'hot') {
            items.push(
                item('chotel-heat-water', 'Прогулки и город', 'Бутылки воды на прогулки', people + ' шт.'),
                item('chotel-heat-sunscreen', 'Гигиена и косметика', 'Солнцезащитный крем и кепка', '1 набор'),
                item('chotel-heat-light-clothes', 'Одежда', 'Лёгкая дышащая одежда', people + ' комплектов'),
            );
        } else if (dayBand === 'cool') {
            items.push(
                item('chotel-cool-jacket', 'Одежда', 'Куртка или тёплая кофта на день', people + ' шт.'),
                item('chotel-cool-scarf', 'Одежда', 'Шарф и закрытая обувь', people + ' комплектов'),
            );
        } else if (dayBand === 'cold') {
            items.push(
                item('chotel-cold-coat', 'Одежда', 'Тёплое пальто или пуховик', people + ' шт.'),
                item('chotel-cold-hat-gloves', 'Одежда', 'Шапка, перчатки, шарф', people + ' комплектов'),
                item('chotel-cold-warm-shoes', 'Обувь', 'Тёплая непромокаемая обувь', people + ' пар'),
                item('chotel-cold-thermos', 'Прогулки и город', 'Термос для горячих напитков на прогулки', Math.max(1, Math.ceil(people / 3)) + ' шт.'),
            );
        }

        // Ночная температура — вечерняя и спальная одежда.
        if (nightBand === 'warm') {
            items.push(item('chotel-night-warm', 'Одежда', 'Лёгкая одежда для сна и вечерних прогулок', people + ' комплектов'));
        } else if (nightBand === 'cool') {
            items.push(item('chotel-night-cool', 'Одежда', 'Тёплая пижама и кофта на вечер', people + ' комплектов'));
        } else if (nightBand === 'cold') {
            items.push(item('chotel-night-cold', 'Одежда', 'Тёплая пижама, носки, тёплый слой на вечер', people + ' комплектов'));
        }

        return {
            id: CITY_HOTEL_PRESET_ID,
            title: CITY_HOTEL_PRESET_TITLE,
            audienceLabel: adultCount + ' ' + pluralPeople(adultCount, 'взрослый', 'взрослых', 'взрослых')
                + (childCount > 0
                    ? ' · ' + childCount + ' ' + pluralPeople(childCount, 'ребёнок', 'ребёнка', 'детей') + ' (' + childAgesSummary(ages) + ')'
                    : ''),
            childAges: ages,
            dayTemp: safeDayTemp,
            nightTemp: safeNightTemp,
            breakfast,
            flying,
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            utilityLabel: formatCityHotelUtilitySummary(breakfast, flying),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function groupChecklistItems(items, extraGroups, groupOrder) {
        const order = Array.isArray(groupOrder) ? groupOrder : [];
        const byGroup = new Map();
        (Array.isArray(extraGroups) ? extraGroups : []).forEach((value) => {
            const group = normalizeChecklistGroupName(value);
            if (!byGroup.has(group)) byGroup.set(group, []);
        });
        (Array.isArray(items) ? items : []).forEach((entry) => {
            const group = normalizeChecklistGroupName(entry?.group);
            if (!byGroup.has(group)) byGroup.set(group, []);
            byGroup.get(group).push(entry);
        });
        const groups = Array.from(byGroup.entries()).map(([group, groupItems]) => ({
            group,
            items: groupItems.slice().sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0)),
        }));
        return groups.sort((left, right) => {
            const leftIndex = order.indexOf(left.group);
            const rightIndex = order.indexOf(right.group);
            const safeLeft = leftIndex === -1 ? 999 : leftIndex;
            const safeRight = rightIndex === -1 ? 999 : rightIndex;
            if (safeLeft !== safeRight) return safeLeft - safeRight;
            return left.group.localeCompare(right.group);
        });
    }

    // Реестр пресетов. Каждый пресет домен-агностично описывает порядок групп,
    // свои бинарные тумблеры (как данные) и билдер списка. UI чеклистов ничего не
    // знает про конкретный пресет — берёт всё из дескриптора.
    const CHECKLIST_PRESETS = [
        {
            id: SEA_TENT_PRESET_ID,
            title: SEA_TENT_PRESET_TITLE,
            subtitle: 'Палатки у моря: погода, удобства лагеря',
            groups: SEA_TENT_GROUPS,
            toggles: [
                { key: 'hasOutlet', onLabel: 'Есть розетка', offLabel: 'Нет розетки' },
                { key: 'hasShower', onLabel: 'Есть душ', offLabel: 'Нет душа' },
            ],
            build: buildSeaTentChecklistPreset,
        },
        {
            id: MOUNTAIN_PRESET_ID,
            title: MOUNTAIN_PRESET_TITLE,
            subtitle: 'Треккинг в горах: ночёвка, снег и лёд',
            groups: MOUNTAIN_GROUPS,
            toggles: [
                { key: 'hasShelter', onLabel: 'Ночёвка в приюте', offLabel: 'Ночёвка в палатке' },
                { key: 'hasSnow', onLabel: 'Снег и лёд на маршруте', offLabel: 'Без снега и льда' },
            ],
            build: buildMountainChecklistPreset,
        },
        {
            id: SEA_HOTEL_PRESET_ID,
            title: SEA_HOTEL_PRESET_TITLE,
            subtitle: 'Море и отель: питание и транспорт',
            groups: SEA_HOTEL_GROUPS,
            toggles: [
                { key: 'allInclusive', onLabel: 'Всё включено', offLabel: 'Питание сами' },
                { key: 'flying', onLabel: 'Летим самолётом', offLabel: 'Едем на машине' },
            ],
            build: buildSeaHotelChecklistPreset,
        },
        {
            id: CITY_RENT_PRESET_ID,
            title: CITY_RENT_PRESET_TITLE,
            subtitle: 'Город и квартира: готовка и транспорт',
            groups: CITY_RENT_GROUPS,
            toggles: [
                { key: 'selfCooking', onLabel: 'Готовим в квартире', offLabel: 'Едим вне дома' },
                { key: 'flying', onLabel: 'Летим самолётом', offLabel: 'Едем на машине' },
            ],
            build: buildCityRentChecklistPreset,
        },
        {
            id: CITY_HOTEL_PRESET_ID,
            title: CITY_HOTEL_PRESET_TITLE,
            subtitle: 'Город и отель: завтрак и транспорт',
            groups: CITY_HOTEL_GROUPS,
            toggles: [
                { key: 'breakfast', onLabel: 'Завтрак включён', offLabel: 'Без завтрака' },
                { key: 'flying', onLabel: 'Летим самолётом', offLabel: 'Едем на машине' },
            ],
            build: buildCityHotelChecklistPreset,
        },
    ];

    function getChecklistPreset(checklist) {
        if (!checklist) return null;
        const presetId = String(checklist.presetId || '');
        const title = String(checklist.title || '').trim();
        return CHECKLIST_PRESETS.find((preset) => preset.id === presetId)
            || CHECKLIST_PRESETS.find((preset) => preset.title === title)
            || null;
    }

    // Собирает options-объект для билдера из значений тумблеров пресета.
    function buildPresetToggleOptions(preset, source) {
        const values = source && typeof source === 'object' ? source : {};
        const options = {};
        (preset?.toggles || []).forEach((toggle) => {
            options[toggle.key] = values[toggle.key] === true;
        });
        return options;
    }

    function getPresetChecklistParams(checklist, preset) {
        const adults = clampCount(checklist?.adults == null ? 2 : checklist.adults, 1, 12);
        const children = clampCount(checklist?.children == null ? 0 : checklist.children, 0, 12);
        const params = {
            adults,
            children,
            childAges: normalizeChildAges(children, checklist?.childAges),
            dayTemp: clampDayTemp(checklist?.dayTemp),
            nightTemp: clampNightTemp(checklist?.nightTemp),
        };
        (preset?.toggles || []).forEach((toggle) => {
            params[toggle.key] = checklist?.[toggle.key] === true;
        });
        return params;
    }

    function mergeChecklistDoneState(nextItems, previousItems) {
        const doneById = new Map();
        (Array.isArray(previousItems) ? previousItems : []).forEach((entry) => {
            if (entry?.id) doneById.set(String(entry.id), entry.done === true);
        });
        return (Array.isArray(nextItems) ? nextItems : []).map((entry) => ({
            ...entry,
            done: doneById.get(String(entry.id)) === true,
        }));
    }

    function isCustomChecklistItemId(id) {
        return String(id || '').startsWith('custom-');
    }

    function normalizeChecklistItemOverrides(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        return Object.keys(value).reduce((overrides, id) => {
            const entry = value[id];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return overrides;
            const patch = {};
            if (Object.prototype.hasOwnProperty.call(entry, 'text')) {
                const text = String(entry.text || '').trim();
                if (text) patch.text = text;
            }
            if (Object.prototype.hasOwnProperty.call(entry, 'quantity')) {
                const quantity = String(entry.quantity || '').trim();
                patch.quantity = quantity;
            }
            if (Object.prototype.hasOwnProperty.call(entry, 'group')) {
                patch.group = normalizeChecklistGroupName(entry.group);
            }
            if (Object.keys(patch).length) overrides[String(id)] = patch;
            return overrides;
        }, {});
    }

    function normalizeChecklistGroupOverrides(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        return Object.keys(value).reduce((overrides, key) => {
            const source = normalizeChecklistGroupName(key).toLocaleLowerCase('ru-RU');
            const target = normalizeChecklistGroupName(value[key]);
            if (source && target) overrides[source] = target;
            return overrides;
        }, {});
    }

    // Собирает items сохранённого пресет-чеклиста из свежего шаблона + per-checklist
    // оверлея: убирает пункты-тумбстоны (removedPresetIds) и доклеивает ручные пункты
    // (id `custom-…`). Оверлей переживает пересборку при смене взрослых/детей/t —
    // удаление и добавление влияют только на этот чеклист, не на шаблон пресета.
    function materializeSeaTentItems(presetItems, currentItems, removedPresetIds, itemOverrides, groupOverrides) {
        const removed = new Set((Array.isArray(removedPresetIds) ? removedPresetIds : []).map(String));
        const overrides = normalizeChecklistItemOverrides(itemOverrides);
        const groupMap = normalizeChecklistGroupOverrides(groupOverrides);
        const visiblePreset = (Array.isArray(presetItems) ? presetItems : [])
            .filter((entry) => !removed.has(String(entry.id)))
            .map((entry) => {
                const group = normalizeChecklistGroupName(entry.group);
                const groupPatch = groupMap[group.toLocaleLowerCase('ru-RU')]
                    ? { group: groupMap[group.toLocaleLowerCase('ru-RU')] }
                    : {};
                return { ...entry, ...groupPatch, ...(overrides[String(entry.id)] || {}) };
            });
        const merged = mergeChecklistDoneState(visiblePreset, currentItems);
        const customs = (Array.isArray(currentItems) ? currentItems : [])
            .filter((entry) => isCustomChecklistItemId(entry && entry.id));
        return merged.concat(customs);
    }


    Object.assign(Checklists, {
        DEFAULT_CHILD_AGE,
        DEFAULT_DAY_TEMP,
        DEFAULT_NIGHT_TEMP,
        CHECKLIST_PRESETS,
        clampCount,
        clampDayTemp,
        clampNightTemp,
        formatTemp,
        getDayTempBand,
        getNightTempBand,
        formatChildAgeInline,
        normalizeChildAges,
        buildPresetToggleOptions,
        getChecklistCustomGroups,
        normalizeChecklistGroupName,
        groupChecklistItems,
        getChecklistPreset,
        getPresetChecklistParams,
        isCustomChecklistItemId,
        normalizeChecklistItemOverrides,
        normalizeChecklistGroupOverrides,
        buildSeaTentChecklistPreset,
        buildMountainChecklistPreset,
        buildSeaHotelChecklistPreset,
        buildCityRentChecklistPreset,
        buildCityHotelChecklistPreset,
        materializeSeaTentItems,
    });

    Planning.buildSeaTentChecklistPreset = buildSeaTentChecklistPreset;
    Planning.buildMountainChecklistPreset = buildMountainChecklistPreset;
    Planning.buildSeaHotelChecklistPreset = buildSeaHotelChecklistPreset;
    Planning.buildCityRentChecklistPreset = buildCityRentChecklistPreset;
    Planning.buildCityHotelChecklistPreset = buildCityHotelChecklistPreset;
    Planning.materializeSeaTentItems = materializeSeaTentItems;
    Planning.materializePresetItems = materializeSeaTentItems;
    Planning.getChecklistPreset = getChecklistPreset;
    Planning.getPresetChecklistParams = getPresetChecklistParams;
    Planning.CHECKLIST_PRESETS = CHECKLIST_PRESETS.slice();
    Planning.getDayTempBand = getDayTempBand;
    Planning.getNightTempBand = getNightTempBand;
})();
