// heys_planning_v1.js — coordinator for HEYS planning runtime
// PIN-only access: renders only when !cloudUser && clientId

(function () {
    'use strict';

    const HEYS = window.HEYS = window.HEYS || {};
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    if (!React) return;

    const h = React.createElement;
    const { useMemo, useState, useEffect, useRef } = React;
    const Planning = HEYS.Planning = HEYS.Planning || {};

    const SUBNAV_ITEMS = [
        { id: 'tasks', label: 'Список', shortLabel: 'Список', icon: '☑️' },
        { id: 'calendar', label: 'Календарь', shortLabel: 'Кален.', icon: '📅' },
        { id: 'gantt', label: 'Гант', shortLabel: 'Гант', icon: '📊' },
        { id: 'chrono', label: 'Хронометраж', shortLabel: 'Хроно', icon: '⏱️' },
        { id: 'checklists', label: 'Чеклисты', shortLabel: 'Чеклисты', icon: '📋' },
    ];
    const DEFAULT_HOME_SCREEN = 'calendar';

    function resolvePlanningHomeScreen(candidate) {
        return SUBNAV_ITEMS.some((item) => item.id === candidate) ? candidate : DEFAULT_HOME_SCREEN;
    }

    function getInitialPlanningHomeScreen(candidate) {
        if (typeof candidate === 'string' && candidate.length > 0) {
            return resolvePlanningHomeScreen(candidate);
        }

        const appPreferredScreen = typeof HEYS?.App?.getDefaultTasksSubtab === 'function'
            ? HEYS.App.getDefaultTasksSubtab()
            : null;

        return resolvePlanningHomeScreen(appPreferredScreen);
    }

    function resolveNextPlanningHomeScreen(currentScreen, requestedScreen, hasUserNavigated) {
        const safeCurrentScreen = resolvePlanningHomeScreen(currentScreen);
        const safeRequestedScreen = resolvePlanningHomeScreen(requestedScreen);

        if (hasUserNavigated) return safeCurrentScreen;

        // Only auto-apply when still at the initial default fallback screen.
        // This prevents jumps caused by profile-updated / client-changed events
        // when the parent's defaultTasksSubtab changes while PlanningTab is
        // already showing a real subtab (meaning the profile loaded correctly).
        if (safeCurrentScreen !== DEFAULT_HOME_SCREEN) return safeCurrentScreen;

        return safeRequestedScreen;
    }

    function PlanningFallback() {
        return h('div', { className: 'planning-tab' },
            h('div', { className: 'planning-content' },
                h('div', { className: 'planning-empty' },
                    'Planning modules ещё загружаются. Обнови экран, если состояние зависло.',
                ),
            ),
        );
    }

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

    function buildSeaTentChecklistPreset(adults, children, childAges, dayTemp, nightTemp) {
        const adultCount = clampCount(adults, 1, 12);
        const childCount = clampCount(children, 0, 12);
        const ages = normalizeChildAges(childCount, childAges);
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

            item('electric-powerbanks', 'Электрика и связь', 'Пауэрбанки', Math.max(1, adultCount) + ' шт.'),
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
                item('heat-fan', 'Электрика и связь', 'Портативный вентилятор на аккумуляторе', '1 шт.'),
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
            tempLabel: formatTempSummary(safeDayTemp, safeNightTemp),
            items: items.map((entry, index) => ({ ...entry, order: index })),
        };
    }

    function groupChecklistItems(items) {
        const byGroup = new Map();
        (Array.isArray(items) ? items : []).forEach((entry) => {
            const group = entry?.group || 'Общее';
            if (!byGroup.has(group)) byGroup.set(group, []);
            byGroup.get(group).push(entry);
        });
        const groups = Array.from(byGroup.entries()).map(([group, groupItems]) => ({
            group,
            items: groupItems.slice().sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0)),
        }));
        return groups.sort((left, right) => {
            const leftIndex = SEA_TENT_GROUPS.indexOf(left.group);
            const rightIndex = SEA_TENT_GROUPS.indexOf(right.group);
            const safeLeft = leftIndex === -1 ? 999 : leftIndex;
            const safeRight = rightIndex === -1 ? 999 : rightIndex;
            if (safeLeft !== safeRight) return safeLeft - safeRight;
            return left.group.localeCompare(right.group);
        });
    }

    function isSeaTentChecklist(checklist) {
        if (!checklist) return false;
        return String(checklist.presetId || '') === SEA_TENT_PRESET_ID
            || String(checklist.title || '').trim() === SEA_TENT_PRESET_TITLE;
    }

    function getSeaTentChecklistParams(checklist) {
        const adults = clampCount(checklist?.adults == null ? 2 : checklist.adults, 1, 12);
        const children = clampCount(checklist?.children == null ? 0 : checklist.children, 0, 12);
        return {
            adults,
            children,
            childAges: normalizeChildAges(children, checklist?.childAges),
            dayTemp: clampDayTemp(checklist?.dayTemp),
            nightTemp: clampNightTemp(checklist?.nightTemp),
        };
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

    // Собирает items сохранённого пресет-чеклиста из свежего шаблона + per-checklist
    // оверлея: убирает пункты-тумбстоны (removedPresetIds) и доклеивает ручные пункты
    // (id `custom-…`). Оверлей переживает пересборку при смене взрослых/детей/t —
    // удаление и добавление влияют только на этот чеклист, не на шаблон пресета.
    function materializeSeaTentItems(presetItems, currentItems, removedPresetIds) {
        const removed = new Set((Array.isArray(removedPresetIds) ? removedPresetIds : []).map(String));
        const visiblePreset = (Array.isArray(presetItems) ? presetItems : [])
            .filter((entry) => !removed.has(String(entry.id)));
        const merged = mergeChecklistDoneState(visiblePreset, currentItems);
        const customs = (Array.isArray(currentItems) ? currentItems : [])
            .filter((entry) => isCustomChecklistItemId(entry && entry.id));
        return merged.concat(customs);
    }

    function ChecklistsScreen({ state } = {}) {
        const checklists = Array.isArray(state?.checklists) ? state.checklists : [];
        const [createOpen, setCreateOpen] = useState(false);
        const [createMode, setCreateMode] = useState('custom');
        const [customTitle, setCustomTitle] = useState('');
        const [adults, setAdults] = useState(2);
        const [children, setChildren] = useState(0);
        const [childAges, setChildAges] = useState([]);
        const [dayTemp, setDayTemp] = useState(DEFAULT_DAY_TEMP);
        const [nightTemp, setNightTemp] = useState(DEFAULT_NIGHT_TEMP);
        const [previewDone, setPreviewDone] = useState({});
        const [addItemTarget, setAddItemTarget] = useState(null);
        const [newItemText, setNewItemText] = useState('');
        const [newItemQty, setNewItemQty] = useState('');
        const selectedPreset = useMemo(
            () => buildSeaTentChecklistPreset(adults, children, childAges, dayTemp, nightTemp),
            [adults, children, childAges, dayTemp, nightTemp],
        );
        const previewItems = useMemo(() => selectedPreset.items.map((entry) => ({
            ...entry,
            done: previewDone[entry.id] === true,
        })), [selectedPreset, previewDone]);

        const anyModalOpen = createOpen || addItemTarget != null;
        useEffect(() => {
            if (typeof document === 'undefined' || !document.body || !anyModalOpen) return undefined;
            document.body.classList.add('planning-checklist-modal-open');
            return () => {
                document.body.classList.remove('planning-checklist-modal-open');
            };
        }, [anyModalOpen]);

        const setCount = (kind, delta) => {
            if (kind === 'adults') {
                setAdults((value) => clampCount(value + delta, 1, 12));
            } else {
                setChildren((value) => {
                    const next = clampCount(value + delta, 0, 12);
                    setChildAges((ages) => normalizeChildAges(next, ages));
                    return next;
                });
            }
        };

        const setTemp = (kind, delta) => {
            if (kind === 'day') {
                setDayTemp((value) => clampDayTemp(value + delta));
            } else {
                setNightTemp((value) => clampNightTemp(value + delta));
            }
        };

        const setPreviewChildAge = (index, delta) => {
            setChildAges((ages) => {
                const normalized = normalizeChildAges(children, ages);
                normalized[index] = clampCount((normalized[index] ?? DEFAULT_CHILD_AGE) + delta, 0, 17);
                return normalized;
            });
        };

        const openCreateModal = () => {
            setCreateMode('custom');
            setCreateOpen(true);
        };

        const closeCreateModal = () => {
            setCreateOpen(false);
        };

        const handleCreateCustom = () => {
            if (typeof state?.addChecklist !== 'function') return;
            const title = String(customTitle || '').trim() || 'Новый чек-лист';
            state.addChecklist({ title, items: [] });
            setCustomTitle('');
            closeCreateModal();
        };

        const handleCreatePreset = () => {
            if (typeof state?.addChecklist !== 'function') return;
            state.addChecklist({
                title: selectedPreset.title,
                presetId: selectedPreset.id,
                adults,
                children,
                childAges: selectedPreset.childAges,
                dayTemp: selectedPreset.dayTemp,
                nightTemp: selectedPreset.nightTemp,
                items: previewItems,
            });
            setPreviewDone({});
            closeCreateModal();
        };

        const togglePreviewItem = (id) => {
            setPreviewDone((current) => ({ ...current, [id]: current[id] !== true }));
        };

        const toggleSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const items = (Array.isArray(checklist.items) ? checklist.items : []).map((entry) => (
                entry.id === itemId ? { ...entry, done: entry.done !== true } : entry
            ));
            state.updateChecklist(checklist.id, { items });
        };

        // Удаление пункта только в этом чеклисте. Для пресет-пунктов пишем тумбстон
        // (removedPresetIds), чтобы пересборка по взрослым/детям/t не вернула пункт.
        // Ручные пункты (custom-…) просто убираются из items. Шаблон пресета не меняется.
        const deleteSavedItem = (checklist, itemId) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const items = (Array.isArray(checklist.items) ? checklist.items : [])
                .filter((entry) => entry.id !== itemId);
            const patch = { items };
            if (isSeaTentChecklist(checklist) && !isCustomChecklistItemId(itemId)) {
                const removed = Array.isArray(checklist.removedPresetIds)
                    ? checklist.removedPresetIds.map(String)
                    : [];
                if (!removed.includes(String(itemId))) removed.push(String(itemId));
                patch.removedPresetIds = removed;
            }
            state.updateChecklist(checklist.id, patch);
        };

        // Добавление ручного пункта в группу — только этот чеклист. Кастомный id
        // (custom-…) переживает пересборку пресета через materializeSeaTentItems.
        const addSavedItem = (checklist, group, details) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return false;
            const text = String(details?.text || '').trim();
            if (!text) return false;
            const quantity = String(details?.quantity || '').trim();
            const existing = Array.isArray(checklist.items) ? checklist.items : [];
            const suffix = Math.random().toString(36).slice(2, 8);
            const newItem = {
                id: 'custom-' + String(Date.now()) + '-' + suffix,
                group: String(group || '').trim() || 'Общее',
                text,
                quantity: quantity || undefined,
                done: false,
                order: 9000 + existing.length,
            };
            state.updateChecklist(checklist.id, { items: existing.concat(newItem) });
            return true;
        };

        const openAddItemModal = (checklist, group) => {
            setAddItemTarget({ checklistId: checklist.id, group });
            setNewItemText('');
            setNewItemQty('');
        };

        const closeAddItemModal = () => {
            setAddItemTarget(null);
            setNewItemText('');
            setNewItemQty('');
        };

        const handleAddItemSubmit = () => {
            if (!addItemTarget) return;
            const checklist = checklists.find((entry) => entry.id === addItemTarget.checklistId);
            if (!checklist) {
                closeAddItemModal();
                return;
            }
            const added = addSavedItem(checklist, addItemTarget.group, { text: newItemText, quantity: newItemQty });
            if (added) closeAddItemModal();
        };

        const deleteSavedChecklist = (checklist) => {
            if (!checklist || typeof state?.deleteChecklist !== 'function') return;
            const title = String(checklist.title || 'чек-лист');
            const shouldDelete = typeof window === 'undefined' || typeof window.confirm !== 'function'
                ? true
                : window.confirm('Удалить «' + title + '»?');
            if (!shouldDelete) return;
            state.deleteChecklist(checklist.id);
        };

        const updateSeaTentChecklistParams = (checklist, patch) => {
            if (!checklist || typeof state?.updateChecklist !== 'function') return;
            const current = getSeaTentChecklistParams(checklist);
            const nextAdults = clampCount(
                Object.prototype.hasOwnProperty.call(patch || {}, 'adults') ? patch.adults : current.adults,
                1,
                12,
            );
            const nextChildren = clampCount(
                Object.prototype.hasOwnProperty.call(patch || {}, 'children') ? patch.children : current.children,
                0,
                12,
            );
            const nextChildAges = normalizeChildAges(
                nextChildren,
                Object.prototype.hasOwnProperty.call(patch || {}, 'childAges') ? patch.childAges : current.childAges,
            );
            const nextDayTemp = clampDayTemp(
                Object.prototype.hasOwnProperty.call(patch || {}, 'dayTemp') ? patch.dayTemp : current.dayTemp,
            );
            const nextNightTemp = clampNightTemp(
                Object.prototype.hasOwnProperty.call(patch || {}, 'nightTemp') ? patch.nightTemp : current.nightTemp,
            );
            const nextPreset = buildSeaTentChecklistPreset(nextAdults, nextChildren, nextChildAges, nextDayTemp, nextNightTemp);
            const removedPresetIds = Array.isArray(checklist.removedPresetIds) ? checklist.removedPresetIds : [];
            state.updateChecklist(checklist.id, {
                presetId: SEA_TENT_PRESET_ID,
                adults: nextAdults,
                children: nextChildren,
                childAges: nextPreset.childAges,
                dayTemp: nextPreset.dayTemp,
                nightTemp: nextPreset.nightTemp,
                removedPresetIds,
                items: materializeSeaTentItems(nextPreset.items, checklist.items, removedPresetIds),
            });
        };

        const updateSavedCount = (checklist, kind, delta) => {
            const params = getSeaTentChecklistParams(checklist);
            if (kind === 'adults') {
                updateSeaTentChecklistParams(checklist, { adults: params.adults + delta });
            } else {
                updateSeaTentChecklistParams(checklist, { children: params.children + delta });
            }
        };

        const updateSavedChildAge = (checklist, index, delta) => {
            const params = getSeaTentChecklistParams(checklist);
            const nextAges = params.childAges.slice();
            nextAges[index] = clampCount((nextAges[index] ?? DEFAULT_CHILD_AGE) + delta, 0, 17);
            updateSeaTentChecklistParams(checklist, { childAges: nextAges });
        };

        const updateSavedTemp = (checklist, kind, delta) => {
            const params = getSeaTentChecklistParams(checklist);
            if (kind === 'day') {
                updateSeaTentChecklistParams(checklist, { dayTemp: params.dayTemp + delta });
            } else {
                updateSeaTentChecklistParams(checklist, { nightTemp: params.nightTemp + delta });
            }
        };

        const renderAgeInlineControls = (ages, onAgeDelta, keyPrefix) => {
            const safeAges = Array.isArray(ages) ? ages : [];
            if (!safeAges.length) return null;
            return h('div', { className: 'planning-checklists-screen__age-inline' },
                safeAges.map((age, index) => h('div', {
                    key: keyPrefix + index,
                    className: 'planning-checklists-screen__age-inline-control',
                },
                    h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--age planning-checklists-screen__stepper--age-inline' },
                        h('button', { type: 'button', onClick: () => onAgeDelta(index, -1), 'aria-label': 'Уменьшить возраст ребёнка ' + (index + 1) }, '−'),
                        h('strong', null, formatChildAgeInline(age)),
                        h('button', { type: 'button', onClick: () => onAgeDelta(index, 1), 'aria-label': 'Увеличить возраст ребёнка ' + (index + 1) }, '+'),
                    ),
                )),
            );
        };

        const renderTempControls = (currentDayTemp, currentNightTemp, onDayDelta, onNightDelta) => h(
            'div',
            { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--temps' },
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Днём'),
                h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--temp' },
                    h('button', { type: 'button', onClick: () => onDayDelta(-1), 'aria-label': 'Понизить дневную температуру' }, '−'),
                    h('strong', null, formatTemp(currentDayTemp)),
                    h('button', { type: 'button', onClick: () => onDayDelta(1), 'aria-label': 'Повысить дневную температуру' }, '+'),
                ),
            ),
            h('div', { className: 'planning-checklists-screen__counter' },
                h('span', null, 'Ночью'),
                h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--temp' },
                    h('button', { type: 'button', onClick: () => onNightDelta(-1), 'aria-label': 'Понизить ночную температуру' }, '−'),
                    h('strong', null, formatTemp(currentNightTemp)),
                    h('button', { type: 'button', onClick: () => onNightDelta(1), 'aria-label': 'Повысить ночную температуру' }, '+'),
                ),
            ),
        );

        const renderChecklistMeta = (checklist) => {
            const count = Array.isArray(checklist.items) ? checklist.items.length : 0;
            if (!isSeaTentChecklist(checklist)) return count + ' пунктов';
            const params = getSeaTentChecklistParams(checklist);
            const preset = buildSeaTentChecklistPreset(
                params.adults, params.children, params.childAges, params.dayTemp, params.nightTemp,
            );
            return count + ' пунктов · ' + preset.audienceLabel + ' · ' + preset.tempLabel;
        };

        const renderItem = (entry, onToggle, keyPrefix, onDelete) => h('div', {
            key: keyPrefix + entry.id,
            className: 'planning-checklists-screen__item-row',
        },
            h('label', {
                className: 'planning-checklists-screen__item' + (entry.done ? ' is-done' : ''),
            },
                h('input', {
                    type: 'checkbox',
                    checked: entry.done === true,
                    onChange: () => onToggle(entry.id),
                }),
                h('span', { className: 'planning-checklists-screen__item-text' },
                    entry.quantity && h('span', { className: 'planning-checklists-screen__item-qty' }, entry.quantity),
                    h('span', null, entry.text),
                    entry.note && h('span', { className: 'planning-checklists-screen__item-note' }, entry.note),
                ),
            ),
            onDelete && h('button', {
                type: 'button',
                className: 'planning-checklists-screen__item-delete',
                onClick: () => onDelete(entry.id),
                'aria-label': 'Удалить пункт',
                title: 'Удалить пункт',
            }, '×'),
        );

        const renderGroups = (items, onToggle, keyPrefix, options) => {
            const opts = options || {};
            return h('div', { className: 'planning-checklists-screen__groups' },
                groupChecklistItems(items).map((section) => h('section', {
                    key: keyPrefix + section.group,
                    className: 'planning-checklists-screen__group',
                },
                    h('div', { className: 'planning-checklists-screen__group-head' },
                        h('h3', { className: 'planning-checklists-screen__group-title' }, section.group),
                        typeof opts.onAddToGroup === 'function' && h('button', {
                            type: 'button',
                            className: 'planning-checklists-screen__group-add',
                            onClick: () => opts.onAddToGroup(section.group),
                            'aria-label': 'Добавить пункт в группу «' + section.group + '»',
                            title: 'Добавить пункт',
                        }, '+'),
                    ),
                    h('div', { className: 'planning-checklists-screen__group-list' },
                        section.items.map((entry) => renderItem(entry, onToggle, keyPrefix, opts.onDelete)),
                    ),
                )),
            );
        };

        const renderSavedPresetControls = (checklist) => {
            if (!isSeaTentChecklist(checklist)) return null;
            const params = getSeaTentChecklistParams(checklist);
            return h('div', { className: 'planning-checklists-screen__saved-controls' },
                h('div', { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--saved' },
                    h('div', { className: 'planning-checklists-screen__counter' },
                        h('span', null, 'Взрослые'),
                        h('div', { className: 'planning-checklists-screen__stepper' },
                            h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'adults', -1), 'aria-label': 'Уменьшить количество взрослых' }, '−'),
                            h('strong', null, params.adults),
                            h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'adults', 1), 'aria-label': 'Увеличить количество взрослых' }, '+'),
                        ),
                    ),
                    h('div', {
                        className: 'planning-checklists-screen__counter planning-checklists-screen__counter--children'
                            + (params.children > 0 ? ' has-ages' : ''),
                    },
                        h('span', null, 'Дети'),
                        h('div', { className: 'planning-checklists-screen__children-tools' },
                            h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--count' },
                                h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'children', -1), 'aria-label': 'Уменьшить количество детей' }, '−'),
                                h('strong', null, params.children),
                                h('button', { type: 'button', onClick: () => updateSavedCount(checklist, 'children', 1), 'aria-label': 'Увеличить количество детей' }, '+'),
                            ),
                            params.children > 0 && renderAgeInlineControls(
                                params.childAges,
                                (index, delta) => updateSavedChildAge(checklist, index, delta),
                                checklist.id + '-child-age-',
                            ),
                        ),
                    ),
                ),
                renderTempControls(
                    params.dayTemp,
                    params.nightTemp,
                    (delta) => updateSavedTemp(checklist, 'day', delta),
                    (delta) => updateSavedTemp(checklist, 'night', delta),
                ),
            );
        };

        const renderCreateModal = () => {
            if (!createOpen) return null;
            const canCreate = typeof state?.addChecklist === 'function';
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeCreateModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Новый чек-лист',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Новый чек-лист'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeCreateModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__tabs' },
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__tab' + (createMode === 'custom' ? ' is-active' : ''),
                            onClick: () => setCreateMode('custom'),
                        }, 'Свой'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__tab' + (createMode === 'preset' ? ' is-active' : ''),
                            onClick: () => setCreateMode('preset'),
                        }, 'Пресет'),
                    ),
                    createMode === 'custom'
                        ? h('div', { className: 'planning-checklists-modal__body' },
                            h('input', {
                                className: 'planning-checklists-modal__input',
                                value: customTitle,
                                onChange: (event) => setCustomTitle(event.target.value),
                                onKeyDown: (event) => {
                                    if (event.key === 'Enter') handleCreateCustom();
                                },
                                placeholder: 'Название чек-листа',
                            }),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handleCreateCustom,
                                disabled: !canCreate,
                            }, 'Создать'),
                        )
                        : h('div', { className: 'planning-checklists-modal__body' },
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__preset-option is-active',
                                onClick: () => {},
                            },
                                h('span', null, selectedPreset.title),
                                h('small', null, selectedPreset.audienceLabel + ' · ' + selectedPreset.tempLabel),
                            ),
                            h('div', { className: 'planning-checklists-screen__counters planning-checklists-screen__counters--modal' },
                                h('div', { className: 'planning-checklists-screen__counter' },
                                    h('span', null, 'Взрослые'),
                                    h('div', { className: 'planning-checklists-screen__stepper' },
                                        h('button', { type: 'button', onClick: () => setCount('adults', -1), 'aria-label': 'Уменьшить количество взрослых' }, '−'),
                                        h('strong', null, adults),
                                        h('button', { type: 'button', onClick: () => setCount('adults', 1), 'aria-label': 'Увеличить количество взрослых' }, '+'),
                                    ),
                                ),
                                h('div', {
                                    className: 'planning-checklists-screen__counter planning-checklists-screen__counter--children'
                                        + (children > 0 ? ' has-ages' : ''),
                                },
                                    h('span', null, 'Дети'),
                                    h('div', { className: 'planning-checklists-screen__children-tools' },
                                        h('div', { className: 'planning-checklists-screen__stepper planning-checklists-screen__stepper--count' },
                                            h('button', { type: 'button', onClick: () => setCount('children', -1), 'aria-label': 'Уменьшить количество детей' }, '−'),
                                            h('strong', null, children),
                                            h('button', { type: 'button', onClick: () => setCount('children', 1), 'aria-label': 'Увеличить количество детей' }, '+'),
                                        ),
                                        children > 0 && renderAgeInlineControls(
                                            normalizeChildAges(children, childAges),
                                            setPreviewChildAge,
                                            'preview-child-age-',
                                        ),
                                    ),
                                ),
                            ),
                            renderTempControls(
                                dayTemp,
                                nightTemp,
                                (delta) => setTemp('day', delta),
                                (delta) => setTemp('night', delta),
                            ),
                            h('div', { className: 'planning-checklists-modal__preview' },
                                renderGroups(previewItems, togglePreviewItem, 'preview-'),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-modal__primary',
                                onClick: handleCreatePreset,
                                disabled: !canCreate,
                            }, 'Создать из пресета'),
                        ),
                ),
            );
        };

        const renderAddItemModal = () => {
            if (!addItemTarget) return null;
            const checklist = checklists.find((entry) => entry.id === addItemTarget.checklistId);
            if (!checklist) return null;
            const canAdd = String(newItemText || '').trim().length > 0;
            return h('div', {
                className: 'planning-checklists-modal-overlay',
                onClick: (event) => {
                    if (event.target === event.currentTarget) closeAddItemModal();
                },
            },
                h('div', {
                    className: 'planning-checklists-modal planning-checklists-modal--compact',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Новый пункт',
                },
                    h('div', { className: 'planning-checklists-modal__head' },
                        h('h2', null, 'Новый пункт'),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__close',
                            onClick: closeAddItemModal,
                            'aria-label': 'Закрыть',
                        }, '×'),
                    ),
                    h('div', { className: 'planning-checklists-modal__group-hint' }, addItemTarget.group),
                    h('div', { className: 'planning-checklists-modal__body' },
                        h('input', {
                            className: 'planning-checklists-modal__input',
                            value: newItemText,
                            autoFocus: true,
                            onChange: (event) => setNewItemText(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddItemSubmit();
                            },
                            placeholder: 'Название пункта',
                        }),
                        h('input', {
                            className: 'planning-checklists-modal__input',
                            value: newItemQty,
                            onChange: (event) => setNewItemQty(event.target.value),
                            onKeyDown: (event) => {
                                if (event.key === 'Enter') handleAddItemSubmit();
                            },
                            placeholder: 'Количество (необязательно)',
                        }),
                        h('button', {
                            type: 'button',
                            className: 'planning-checklists-modal__primary',
                            onClick: handleAddItemSubmit,
                            disabled: !canAdd,
                        }, 'Добавить'),
                    ),
                ),
            );
        };

        return h('div', { className: 'planning-checklists-screen' },
            h('div', { className: 'planning-checklists-screen__header' },
                h('h2', { className: 'planning-checklists-screen__title' }, 'Ваши чеклисты'),
                h('button', {
                    type: 'button',
                    className: 'planning-checklists-screen__create',
                    onClick: openCreateModal,
                    disabled: typeof state?.addChecklist !== 'function',
                },
                    h('span', { className: 'planning-checklists-screen__create-icon', 'aria-hidden': 'true' }, '+'),
                    h('span', null, 'Создать чек-лист'),
                ),
            ),
            checklists.length === 0
                ? h('div', { className: 'planning-empty planning-empty--inline' }, 'Пока нет чеклистов.')
                : h('div', { className: 'planning-checklists-screen__list' },
                    checklists.map((checklist) => h('div', {
                        key: checklist.id,
                        className: 'planning-checklists-screen__card',
                    },
                        h('div', { className: 'planning-checklists-screen__card-head' },
                            h('div', { className: 'planning-checklists-screen__card-copy' },
                                h('div', { className: 'planning-checklists-screen__card-title' }, checklist.title || 'Чек-лист'),
                                h('div', { className: 'planning-checklists-screen__card-meta' },
                                    renderChecklistMeta(checklist),
                                ),
                            ),
                            h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__delete',
                                onClick: () => deleteSavedChecklist(checklist),
                                disabled: typeof state?.deleteChecklist !== 'function',
                                'aria-label': 'Удалить чек-лист',
                                title: 'Удалить',
                            }, '×'),
                        ),
                        renderSavedPresetControls(checklist),
                        renderGroups(
                            checklist.items || [],
                            (itemId) => toggleSavedItem(checklist, itemId),
                            'saved-' + checklist.id + '-',
                            {
                                onDelete: (itemId) => deleteSavedItem(checklist, itemId),
                                onAddToGroup: (group) => openAddItemModal(checklist, group),
                            },
                        ),
                        (Array.isArray(checklist.items) ? checklist.items.length : 0) === 0
                            && h('button', {
                                type: 'button',
                                className: 'planning-checklists-screen__empty-add',
                                onClick: () => openAddItemModal(checklist, 'Общее'),
                            }, '+ Добавить пункт'),
                    )),
                ),
            renderCreateModal(),
            renderAddItemModal(),
        );
    }

    function resolvePlanningRuntime() {
        const TasksScreen = HEYS.PlanningTasks && HEYS.PlanningTasks.TasksScreen;
        const CalendarScreen = HEYS.PlanningSchedule && HEYS.PlanningSchedule.CalendarScreen;
        const useGanttV2 = !!(HEYS.featureFlags && typeof HEYS.featureFlags.isEnabled === 'function'
            && HEYS.featureFlags.isEnabled('gantt_v2'));
        const GanttScreen = useGanttV2 && HEYS.PlanningGantt && HEYS.PlanningGantt.GanttScreen
            ? HEYS.PlanningGantt.GanttScreen
            : (HEYS.PlanningSchedule && HEYS.PlanningSchedule.GanttScreen);
        const ChronoScreen = HEYS.PlanningChrono && HEYS.PlanningChrono.ChronoScreen;
        const usePlanningState = Planning.Hooks && Planning.Hooks.usePlanningState;

        return {
            TasksScreen,
            CalendarScreen,
            GanttScreen,
            ChronoScreen,
            usePlanningState,
            store: Planning.Store || {},
        };
    }

    function PlanningTab(props = {}) {
        const requestedHomeScreen = getInitialPlanningHomeScreen(props.defaultHomeScreen);
        const [activeScreen, setActiveScreen] = useState(() => requestedHomeScreen);
        const [layoutMetrics, setLayoutMetrics] = useState({ mainTabsHeight: 0, subnavHeight: 0 });
        const runtime = resolvePlanningRuntime();
        const planState = runtime.usePlanningState ? runtime.usePlanningState() : null;
        const subnavRef = useRef(null);
        const hasUserNavigatedRef = useRef(false);

        useEffect(() => {
            setActiveScreen((currentScreen) => {
                const nextScreen = resolveNextPlanningHomeScreen(
                    currentScreen,
                    requestedHomeScreen,
                    hasUserNavigatedRef.current,
                );

                return currentScreen === nextScreen ? currentScreen : nextScreen;
            });
        }, [requestedHomeScreen]);

        useEffect(() => {
            if (typeof document === 'undefined' || !document.body) return undefined;
            document.body.classList.add('planning-tab-active');
            return () => {
                document.body.classList.remove('planning-tab-active');
            };
        }, []);

        useEffect(() => {
            const pull = HEYS.Planning && typeof HEYS.Planning.refreshPlanningFromCloud === 'function'
                ? HEYS.Planning.refreshPlanningFromCloud
                : null;
            if (!pull) return undefined;
            pull().catch(function () { /* offline / RPC optional */ });
            return undefined;
        }, []);

        useEffect(() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

            let frameId = 0;
            const measureLayout = () => {
                const nextMainTabsHeight = Math.round(document.querySelector('.tabs')?.getBoundingClientRect?.().height || 0);
                const nextSubnavHeight = Math.round(subnavRef.current?.getBoundingClientRect?.().height || 0);

                setLayoutMetrics((current) => {
                    if (current.mainTabsHeight === nextMainTabsHeight && current.subnavHeight === nextSubnavHeight) {
                        return current;
                    }

                    return {
                        mainTabsHeight: nextMainTabsHeight,
                        subnavHeight: nextSubnavHeight,
                    };
                });
            };

            frameId = window.requestAnimationFrame(measureLayout);

            const resizeObserver = typeof ResizeObserver === 'function'
                ? new ResizeObserver(() => measureLayout())
                : null;
            const tabsElement = document.querySelector('.tabs');

            if (resizeObserver) {
                if (tabsElement) resizeObserver.observe(tabsElement);
                if (subnavRef.current) resizeObserver.observe(subnavRef.current);
            }

            window.addEventListener('resize', measureLayout);
            return () => {
                window.cancelAnimationFrame(frameId);
                window.removeEventListener('resize', measureLayout);
                if (resizeObserver) resizeObserver.disconnect();
            };
        }, []);

        const planningLayoutStyle = useMemo(() => {
            const style = {};

            if (layoutMetrics.mainTabsHeight > 0) {
                style['--planning-main-tabs-height'] = layoutMetrics.mainTabsHeight + 'px';
            }

            if (layoutMetrics.subnavHeight > 0) {
                style['--planning-subnav-height'] = layoutMetrics.subnavHeight + 'px';
            }

            return style;
        }, [layoutMetrics.mainTabsHeight, layoutMetrics.subnavHeight]);

        const CurrentScreen = useMemo(() => {
            if (activeScreen === 'calendar') return runtime.CalendarScreen;
            if (activeScreen === 'gantt') return runtime.GanttScreen;
            if (activeScreen === 'chrono') return runtime.ChronoScreen;
            if (activeScreen === 'checklists') return ChecklistsScreen;
            return runtime.TasksScreen;
        }, [activeScreen, runtime.CalendarScreen, runtime.GanttScreen, runtime.ChronoScreen, runtime.TasksScreen]);

        if (!planState || !runtime.TasksScreen || !runtime.CalendarScreen || !runtime.GanttScreen || !runtime.ChronoScreen) {
            console.warn('[HEYS.planning] Planning split modules are not ready yet');
            return h(PlanningFallback);
        }

        const subnavNode = h('div', { className: 'planning-subnav planning-subnav--docked', ref: subnavRef },
            h('div', { className: 'planning-subnav__inner' },
                SUBNAV_ITEMS.map((item) => h('button', {
                    key: item.id,
                    type: 'button',
                    title: item.label,
                    'aria-label': item.label,
                    'data-screen': item.id,
                    className: 'planning-subnav__item' + (activeScreen === item.id ? ' active' : ''),
                    onClick: () => {
                        hasUserNavigatedRef.current = true;
                        setActiveScreen(item.id);
                    },
                },
                    h('span', { className: 'planning-subnav__icon', 'aria-hidden': 'true' }, item.icon),
                    h('span', {
                        className: 'planning-subnav__label',
                        'data-short-label': item.shortLabel || item.label,
                        'aria-hidden': 'true',
                    }, item.label),
                )),
            ),
        );

        return h('div', {
            className: 'planning-tab',
            style: planningLayoutStyle,
            'data-no-pull-refresh': 'true',
        },
            h('div', {
                className: 'planning-content'
                    + (activeScreen === 'calendar' ? ' planning-content--calendar-lock-scroll' : ''),
            },
                CurrentScreen ? h(CurrentScreen, { state: planState }) : h(PlanningFallback),
            ),
            h('div', { className: 'planning-subnav-shell', 'aria-hidden': 'true' }),
            ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined'
                ? ReactDOM.createPortal(subnavNode, document.body)
                : subnavNode,
        );
    }

    HEYS.PlanningTab = PlanningTab;
    Planning.buildSeaTentChecklistPreset = buildSeaTentChecklistPreset;
    Planning.materializeSeaTentItems = materializeSeaTentItems;
    Planning.getDayTempBand = getDayTempBand;
    Planning.getNightTempBand = getNightTempBand;
    Planning.SUBNAV_ITEMS = SUBNAV_ITEMS.slice();
    Planning.DEFAULT_HOME_SCREEN = DEFAULT_HOME_SCREEN;
    Planning.resolveHomeScreen = resolvePlanningHomeScreen;
    Planning.getInitialHomeScreen = getInitialPlanningHomeScreen;
    Planning.resolveNextHomeScreen = resolveNextPlanningHomeScreen;
    HEYS.PlanningData = Planning.Store || {};
    console.info('[HEYS.planning] ✅ PlanningTab coordinator registered');
})();
