-- Auto recalculate harm for 172 products
-- Date: 2026-01-31
-- Formula: HarmScore v2.0 (see DATA_MODEL_REFERENCE.md)

BEGIN;

UPDATE shared_products SET harm = 0.5 WHERE id = 'd7bd894c-e22c-4086-8ef4-5b8cd507e96c'; -- Bionova крем-суп грибной протеиновый
UPDATE shared_products SET harm = 3 WHERE id = '15a15f7a-84c0-40ca-8bd5-e3ddca1c8cdc'; -- BootyBar карамельный CRUNCH
UPDATE shared_products SET harm = 4.1 WHERE id = '4abdae38-15f4-4059-9902-757c75b8ddf2'; -- Cafe Au Lait (растворимый)
UPDATE shared_products SET harm = 5.7 WHERE id = 'bd5b0512-e403-4cdc-a26a-bfbeef49c8d8'; -- PediaSure Малоежка ваниль
UPDATE shared_products SET harm = 3.3 WHERE id = 'd79a5653-df37-43ed-b0cc-a590a404ff66'; -- Planto Фундук и пекан
UPDATE shared_products SET harm = 2.6 WHERE id = '22c618a5-3e62-4f00-9dc4-4033bac0b5f4'; -- Аджика неострая
UPDATE shared_products SET harm = 1.7 WHERE id = '0a1ab62a-f917-408c-a068-49a93472d4e9'; -- Ананасы консервированные (в собственном соку)
UPDATE shared_products SET harm = 0 WHERE id = '073b868a-0f78-4ccf-a821-050133707e19'; -- Апельсин
UPDATE shared_products SET harm = 0.6 WHERE id = '3f654aa9-5509-47fa-aa32-02fc44f662b6'; -- Банан
UPDATE shared_products SET harm = 8.2 WHERE id = '78a65da5-970e-4bd7-9bea-a619ac88a0e9'; -- Белёвская пастила классическая
UPDATE shared_products SET harm = 4.9 WHERE id = '8951c6b4-97db-498a-8915-e72d33c61331'; -- Блины классические
UPDATE shared_products SET harm = 0 WHERE id = '92226580-eaa5-40a9-9acf-21284d8b8a69'; -- Блины овсяные без сахара
UPDATE shared_products SET harm = 2.3 WHERE id = '166538c1-bcdd-4e5a-888a-ad54d1c3e06a'; -- Бризоль куриная ЕКСЕЛЬ
UPDATE shared_products SET harm = 4.3 WHERE id = 'dbe25593-9e6b-4286-a947-78d783cef0f1'; -- Вареники ленивые с сахаром
UPDATE shared_products SET harm = 3.9 WHERE id = 'ee2b6b93-ce0c-4175-a250-02af6e9128e3'; -- Варенье Самокат малина
UPDATE shared_products SET harm = 6.2 WHERE id = '68c122d4-7504-481d-ad25-0d03b8b5a42d'; -- Вафли классические (вафельница)
UPDATE shared_products SET harm = 1.4 WHERE id = 'feb75bc8-d69e-4ef2-a6ef-3128bc2e9412'; -- Виноград
UPDATE shared_products SET harm = 0.8 WHERE id = '7cca9ede-26cf-4ae2-bb0f-7b5cce63d6ff'; -- Гавайский микс (овощи с рисом)
UPDATE shared_products SET harm = 2.2 WHERE id = '13c01fca-9736-46ed-b1b3-8a66a53c5d74'; -- Говядина в томатном соусе
UPDATE shared_products SET harm = 0 WHERE id = '698cf5a5-d781-4b59-9f23-1671b2700deb'; -- Голубика
UPDATE shared_products SET harm = 2.4 WHERE id = '56e4f417-74ac-4436-856f-09de93e07ab7'; -- Горбуша натуральная (консервы)
UPDATE shared_products SET harm = 2.5 WHERE id = 'b40e30d1-23b8-442a-bdf1-b2ce2c3b5dae'; -- Гранола шоколадная Самокат
UPDATE shared_products SET harm = 5 WHERE id = '7ff6d545-8f89-4315-be28-5e7a216caa2c'; -- Грецкий орех
UPDATE shared_products SET harm = 0.9 WHERE id = '4f298899-3dd2-4298-8811-56d7dc4bd25e'; -- Греческий йогурт Простоквашино 2
UPDATE shared_products SET harm = 0.3 WHERE id = '213c0edd-34e7-4916-b2ab-c7e7d9af5f60'; -- Грибы тушёные в сливках
UPDATE shared_products SET harm = 0 WHERE id = '96baa1e2-4301-486f-b054-c072abafa9c8'; -- Груша
UPDATE shared_products SET harm = 2.5 WHERE id = '76b14b47-7e04-459c-9630-8784ece768fa'; -- Десерт (савоярди, маскарпоне, сливки, мандарины)
UPDATE shared_products SET harm = 2 WHERE id = '7fbf1c63-059f-4882-89cb-6856402cc701'; -- Джем абрикосовый Zuegg (без сахара)
UPDATE shared_products SET harm = 3.8 WHERE id = 'cd4662ce-ddb1-4593-8c9d-d7d819f2d875'; -- Доширак, говядина
UPDATE shared_products SET harm = 2.2 WHERE id = 'b8d53e3a-7bec-4b40-8a30-6896e7b9129c'; -- Желток яйца
UPDATE shared_products SET harm = 0.6 WHERE id = '9a30644b-96a2-4cdf-852f-a1b003bc0447'; -- Жигулёвское пшеничное
UPDATE shared_products SET harm = 6.3 WHERE id = 'efcbd8da-9881-49c6-9341-fd238dd23413'; -- Заправка "Французские пряности и чеснок"
UPDATE shared_products SET harm = 4.4 WHERE id = '6030bf10-feb0-4a3a-9a46-2e52fcafa782'; -- Изюм
UPDATE shared_products SET harm = 1.7 WHERE id = 'cb8d7557-a8a8-4809-a1d8-3afcfd90778c'; -- Индейка в панировке
UPDATE shared_products SET harm = 0 WHERE id = '45438443-98c5-4a78-89d6-50b4cac93f77'; -- Кабачковые оладьи (кабачок, яйцо, мука)
UPDATE shared_products SET harm = 6.7 WHERE id = 'f3f59c8a-9bc8-4133-b160-b4200bfacf2d'; -- Картофель жареный на костре
UPDATE shared_products SET harm = 0.7 WHERE id = '08f4600f-e9bc-40a3-bfa8-a9e613fb66d6'; -- Картофель отварной с маслом
UPDATE shared_products SET harm = 3.1 WHERE id = '4f592ba0-b422-41b6-a712-27b2275f9d45'; -- Картофельное пюре
UPDATE shared_products SET harm = 0.1 WHERE id = '01fdc6e4-850d-48c5-8dff-34e3beadc100'; -- Картошка жареная на мангале
UPDATE shared_products SET harm = 3.4 WHERE id = '72ef865b-0ed5-49b4-a8e7-c768984b5b0a'; -- Кетчуп томатный Helios
UPDATE shared_products SET harm = 1.1 WHERE id = 'b48f0786-0585-47c3-9380-eb857075b6ae'; -- Кефир 2,5 Кубанский молочник
UPDATE shared_products SET harm = 5.9 WHERE id = 'e4028edd-22b8-4cdc-8477-e283d37748a8'; -- Килька в томате
UPDATE shared_products SET harm = 9.1 WHERE id = '37a67ef5-4108-455c-ab12-79873ac25390'; -- Кокосовый сахар
UPDATE shared_products SET harm = 2.6 WHERE id = '0cb5bc91-45e0-4ff0-8638-a8b5d15dd0d3'; -- Колбаса Сабросо Монте (индейка)
UPDATE shared_products SET harm = 1.2 WHERE id = '5c84d018-382a-4d28-b204-d740bab0145e'; -- Коломенский йогурт 5 малина-груша
UPDATE shared_products SET harm = 7.1 WHERE id = 'e803a540-f703-47d6-b097-65d3a1c5d7f0'; -- Конфеты Raffaello
UPDATE shared_products SET harm = 1.4 WHERE id = 'a097a41d-cbf8-4126-861c-3c77c13e4f66'; -- Котлеты морковные Алина
UPDATE shared_products SET harm = 1.2 WHERE id = '3511b614-33a2-46fa-92cc-3b7d94c99811'; -- Котлеты паровые (говядина 40, индейка 40, курица 20)
UPDATE shared_products SET harm = 1.4 WHERE id = '0c04c07d-9e8a-40e0-93e9-5ec72528f10c'; -- Кофе американо
UPDATE shared_products SET harm = 1.2 WHERE id = '6c14a423-6f6f-44e2-b2ac-582bc0ab7f30'; -- Кофе растворимый с молоком 2,5
UPDATE shared_products SET harm = 0.6 WHERE id = 'dc118f1f-c921-4b39-8eb0-2aa967b24cdc'; -- Кофе с молоком (молоко 1,5)
UPDATE shared_products SET harm = 0.3 WHERE id = '61a8e332-a52d-4e83-b871-c4419917ff45'; -- Краб-ролл с сыром и зеленью
UPDATE shared_products SET harm = 4.2 WHERE id = '42c7832f-c9be-4de3-8a3d-737f088ab113'; -- Краб-ролл с творожным сыром
UPDATE shared_products SET harm = 4.5 WHERE id = '9b1ddd8e-ed98-4761-99d0-c97f5756cb63'; -- Краб-ролл с творожным сыром (Русское море)
UPDATE shared_products SET harm = 5.3 WHERE id = 'f9ebdc0c-bc23-4e3f-aa60-33e43c58fb5b'; -- Крабовые палочки (сурими)
UPDATE shared_products SET harm = 0.6 WHERE id = 'e1a42653-2dee-4deb-ac6f-cc7501ea7ba3'; -- Кролик тушёный в сметане
UPDATE shared_products SET harm = 9.7 WHERE id = 'c95c29e6-c261-4fcd-affb-a4ff759d0f85'; -- Кузя кукурузные палочки сладкие
UPDATE shared_products SET harm = 3.1 WHERE id = '74c4fc1d-3d19-4afa-bf63-19a674ac01b4'; -- Курага
UPDATE shared_products SET harm = 1 WHERE id = '537d0c5e-6adc-4611-9bd1-06e695129a52'; -- Куриная голень на мангале
UPDATE shared_products SET harm = 2.2 WHERE id = '6462df14-f133-40f5-b34d-a2b8f0a62af1'; -- Курица шашлык (окорочок без кожи)
UPDATE shared_products SET harm = 1.6 WHERE id = 'c5b608a6-474f-4be7-bdea-a7e945c224d6'; -- Лаваш тонкий
UPDATE shared_products SET harm = 1.1 WHERE id = 'ed5dd413-a97d-4f0b-8fa2-f91de63c2a8c'; -- Лапша соба варёная
UPDATE shared_products SET harm = 6 WHERE id = 'a28afeab-6f43-42b9-941e-d81d74f7b646'; -- Лосось слабосолёный
UPDATE shared_products SET harm = 0.8 WHERE id = '1c77955c-d0c0-45db-8328-10ef38b5eff9'; -- Лосось-ролл с творожным сыром
UPDATE shared_products SET harm = 2.5 WHERE id = '407be700-7f2c-4732-9346-21e8f0e2f501'; -- Люля куриные на гриле
UPDATE shared_products SET harm = 2.9 WHERE id = 'ab4acba0-b665-4281-8633-86b0cc3f3f0a'; -- Манго сушёный без сахара
UPDATE shared_products SET harm = 0.1 WHERE id = '8e64be44-5a79-4301-81dd-02002ec5cb73'; -- Мандарины
UPDATE shared_products SET harm = 9 WHERE id = '815ee6b4-9572-43e0-9dcc-74fa72c66454'; -- Масло сливочное 82,5
UPDATE shared_products SET harm = 8 WHERE id = 'a04bae7e-44b6-423d-956a-7ddaee3a3db1'; -- Мёд горный
UPDATE shared_products SET harm = 0 WHERE id = '34d85507-8e07-4337-8ec1-ed095a425596'; -- Миндаль
UPDATE shared_products SET harm = 0.5 WHERE id = 'a6d498e0-9f9e-44af-a6b1-4c2adf583645'; -- Миндаль жареный (сухая обжарка)
UPDATE shared_products SET harm = 0 WHERE id = '2387a5d2-f7a2-43f1-b022-bee3bdddb0f2'; -- Миндаль сушёный
UPDATE shared_products SET harm = 1.6 WHERE id = '11f41122-dd7a-4859-9efd-e14d20c1ffb9'; -- Миндальный батончик Nut&Go
UPDATE shared_products SET harm = 0.6 WHERE id = '1b17ae58-2071-4cf0-8c8d-d72fb6f0c11c'; -- Миндальный напиток без сахара
UPDATE shared_products SET harm = 0.7 WHERE id = 'a918cde2-47d6-4901-baa2-ae845105cc2f'; -- Минтай тушёный в томате
UPDATE shared_products SET harm = 0.3 WHERE id = 'fde9a0cb-9670-404a-ab12-10d3a7f2f817'; -- Молоко 1,5 Простоквашино
UPDATE shared_products SET harm = 0.6 WHERE id = '6241b44f-2c87-4836-bcee-ad7a61656e8b'; -- Молоко 2,5
UPDATE shared_products SET harm = 0.5 WHERE id = 'e19a0c79-80a1-42c5-800b-6ed60fbc7d18'; -- Молоко ультрапастеризованное 3.5
UPDATE shared_products SET harm = 1.4 WHERE id = '67ed3eda-8cc6-4541-a9c3-6e8cd224134b'; -- Мороженое ванильное Самокат без сахара (вафельный стаканчик)
UPDATE shared_products SET harm = 1.4 WHERE id = 'ae4ca119-dfd7-4cdf-9a47-dc6d8c93748d'; -- Мороженое молочное ванильное без добавления сахара (вафельный стаканчик)
UPDATE shared_products SET harm = 2.3 WHERE id = '496334f3-bdd2-4a29-a61d-0602dac8131b'; -- Морс сладкий
UPDATE shared_products SET harm = 0.4 WHERE id = '4537a15c-199c-4ab1-a462-e523a7da063b'; -- Мясо по-французски (картофель, куриное бедро, майонез, сыр)
UPDATE shared_products SET harm = 4.3 WHERE id = '7959d75f-52d5-4ee3-b4d6-4995f4b9733a'; -- Напиток «Шорле яблочный»
UPDATE shared_products SET harm = 4 WHERE id = '2a2086dd-b65d-4a87-87e7-547db4c3ecce'; -- Напиток молочный КАРАМЕЛЬ
UPDATE shared_products SET harm = 1.6 WHERE id = 'c0db955f-3d3a-4ce0-a03e-cc2ec3741f01'; -- Напиток соевый с фисташкой и кешью
UPDATE shared_products SET harm = 3 WHERE id = '164131bc-7207-42c3-8e14-f3ddd1a17b1c'; -- Начос Самокат томат с базиликом
UPDATE shared_products SET harm = 3.1 WHERE id = 'cae7ef72-ad48-42eb-b8d7-860bd005c724'; -- Нектарин
UPDATE shared_products SET harm = 1.7 WHERE id = '57aae705-89f4-45b5-a9e3-611d6470190c'; -- Овощной суп с вермишелью
UPDATE shared_products SET harm = 4 WHERE id = '748c1b74-7efe-48e6-a61b-bdd48c507abc'; -- Окрошка с колбасой на кефире
UPDATE shared_products SET harm = 7.1 WHERE id = '75cf049c-544b-4d2f-a94e-31c530905ab5'; -- Оладьи классические
UPDATE shared_products SET harm = 3.1 WHERE id = '9b054604-7cf4-41b5-a8c4-529977054da4'; -- Оливье классический с майонезом
UPDATE shared_products SET harm = 6.3 WHERE id = 'fc3e71db-7715-4401-92b0-f903d02b94d5'; -- Оливье с колбасой без майонеза
UPDATE shared_products SET harm = 2.2 WHERE id = '6610f7da-7252-42f4-b0d5-7c771b0f6eaf'; -- Омлет (4 яйца, 5 г масла)
UPDATE shared_products SET harm = 4.3 WHERE id = 'f1e98ce4-aae1-40c5-bb06-985c65f7eb95'; -- Паска 1
UPDATE shared_products SET harm = 3.8 WHERE id = 'f8702278-7f47-4ebc-b4cb-8b7353d5540c'; -- Паска 2
UPDATE shared_products SET harm = 2.8 WHERE id = '8b35a362-47fb-4684-9da6-d9a9abc82221'; -- Печёночный паштет из индейки (классический)
UPDATE shared_products SET harm = 1.4 WHERE id = '2910474f-8321-4e62-b33a-e68f089b6282'; -- Печенье витаминизированное «Юбилейное» с овсяными хлопьями
UPDATE shared_products SET harm = 2.1 WHERE id = '6438a880-5adf-4cb3-b847-77dd8ecf2fd3'; -- Печенье на сиропе топинамбура с кунжутом
UPDATE shared_products SET harm = 2.8 WHERE id = '02900471-3705-44c0-b366-25977f25279b'; -- Печенье ПП из кураги и овсянки
UPDATE shared_products SET harm = 6.8 WHERE id = 'bfd5fe6b-0f3b-4eb3-94ab-ee2be2e6770e'; -- Печенье финиковое с миндальной мукой и овсянкой
UPDATE shared_products SET harm = 0.2 WHERE id = 'c73c6df0-633e-4c89-a38b-df2d7d121a68'; -- Пирог зелёная гречка/овсянка/сухофрукты/яйцо/протеин
UPDATE shared_products SET harm = 6.1 WHERE id = '3dc76903-07e1-416c-b049-15da09327935'; -- Пломбир Коровка из Кореновки 15
UPDATE shared_products SET harm = 7.3 WHERE id = 'c2b3b2bd-3791-4249-9774-9524e2ce4af6'; -- Подсолнечное масло рафинированное
UPDATE shared_products SET harm = 3.1 WHERE id = '60732320-0172-49ef-820e-d4cba12d4163'; -- Пончик глазированный с ванильной начинкой (FitnessShock)
UPDATE shared_products SET harm = 7.5 WHERE id = 'c07cdcae-32e2-43d9-9b5e-abc62b3910e7'; -- Пончик с начинкой карамель
UPDATE shared_products SET harm = 3.6 WHERE id = 'dab097da-af8f-40da-836e-489bdd202225'; -- Протёртая земляника без сахара (на соке)
UPDATE shared_products SET harm = 6.5 WHERE id = '08db19a8-9e46-4482-bea6-ba4c2d9f082b'; -- Протинский хлеб
UPDATE shared_products SET harm = 0 WHERE id = '789b1c57-241e-4581-b599-1b67b842952a'; -- Пшённая крупа отварная
UPDATE shared_products SET harm = 8.6 WHERE id = '7d3ab0a3-d548-4ea3-b5e1-9a8f77131471'; -- Растворимый кофейный напиток MacCoffee The Original 3в1
UPDATE shared_products SET harm = 0.8 WHERE id = 'd73cefb6-524d-47cb-a07b-8b02f09b8c49'; -- Рис белый отварной
UPDATE shared_products SET harm = 0 WHERE id = '5cdaac8a-b459-4a9d-8396-d2f1038bf55f'; -- Рис бурый с диким (отварной)
UPDATE shared_products SET harm = 0.2 WHERE id = 'def43cb8-8667-4fe0-8162-9cdae077821a'; -- Рисовая мука
UPDATE shared_products SET harm = 5 WHERE id = '90dca660-6067-449a-adb5-7771407b0a0b'; -- Сало солёное
UPDATE shared_products SET harm = 9.4 WHERE id = 'ca3b3129-e624-4e7b-8286-7e11fd9b8bd2'; -- Сахар белый
UPDATE shared_products SET harm = 2.8 WHERE id = '884da9d0-f49c-4092-9a78-ddc83347362b'; -- Свинина на рёбрах (без костей)
UPDATE shared_products SET harm = 0 WHERE id = '2c022cf1-d677-4656-b16b-124d8b2a416b'; -- Свинина ребрышки варёные (мясо, без видимого жира)
UPDATE shared_products SET harm = 2.5 WHERE id = '6bb84773-9788-4a40-bff3-85bbf0633300'; -- Свинина шашлык (шея)
UPDATE shared_products SET harm = 5.6 WHERE id = '1504afca-72c0-4110-9144-78a34ef67511'; -- Сгущённое молоко
UPDATE shared_products SET harm = 0.9 WHERE id = '0f7f76bb-fcb6-4fbf-8a0e-858689fac0ba'; -- Сёмга на мангале
UPDATE shared_products SET harm = 2.1 WHERE id = 'e3a2393c-6bc1-40f5-a73e-4d6c650048e2'; -- Семечки подсолнечные жареные
UPDATE shared_products SET harm = 6.8 WHERE id = '93493e13-42e1-4d96-9753-6a33a8ff7866'; -- Семушка смесь орехов и изюма (жареные)
UPDATE shared_products SET harm = 7.5 WHERE id = 'be563e86-99e9-419a-93be-a405f16fb71d'; -- Сироп для кофе (классический сахарный)
UPDATE shared_products SET harm = 0.7 WHERE id = 'c55a5703-1092-4084-b6b9-10defa192a1e'; -- Сливки 10
UPDATE shared_products SET harm = 4 WHERE id = '223c48f0-f857-44af-84ef-a18afc2bcc3f'; -- Смесь "Настин Сластин" (усреднённо)
UPDATE shared_products SET harm = 3.3 WHERE id = '60c614cf-3c5f-4518-898e-9c790fbbff0b'; -- Сметана 15
UPDATE shared_products SET harm = 2.5 WHERE id = '128dd9e1-107b-4514-b06e-385204885443'; -- Снежный краб Русское море
UPDATE shared_products SET harm = 8.2 WHERE id = '1a4b39d1-f1dc-42e8-a751-5693c07f09f7'; -- Сникерс
UPDATE shared_products SET harm = 4.3 WHERE id = '26c8d820-3205-43b2-a628-73755644b5fc'; -- Солёные палочки Lorenz Saltletts
UPDATE shared_products SET harm = 6.7 WHERE id = '0d389499-e882-4a60-85a3-56d92d359667'; -- Сосиски «Вязанка Сливочные»
UPDATE shared_products SET harm = 4.4 WHERE id = '91b6625a-caa0-4a28-83f8-e8f229eeddb4'; -- Соус барбекю Heinz томатный
UPDATE shared_products SET harm = 5.7 WHERE id = '557673b9-9767-4024-bf91-65d484aae479'; -- Соус для макарон «Болоньезе» PIKADOR
UPDATE shared_products SET harm = 4.6 WHERE id = '7e40b8e3-9993-4eff-abc2-7a33f02ca8fd'; -- Соус кавказский красный
UPDATE shared_products SET harm = 7.4 WHERE id = '38ce2592-64b2-4fc5-8b34-63558c96acb5'; -- Соус Цезарь низкокалорийный
UPDATE shared_products SET harm = 10 WHERE id = '89fd8952-aea2-4b68-94f3-974da8dffb63'; -- Соус чесночный низкокалорийный
UPDATE shared_products SET harm = 2.4 WHERE id = '73d51d5c-1586-4d14-9c7b-4ab0d6a63e9c'; -- Суп овощной с фрикадельками
UPDATE shared_products SET harm = 5.9 WHERE id = 'da76cbb2-c9e3-429f-b411-8b4071276b3c'; -- Сыр «Российский молодой» (Николаевский)
UPDATE shared_products SET harm = 4.9 WHERE id = '31200852-6eb2-4906-9edc-651ad0cf185d'; -- Сыр лёгкий «Радость вкуса»
UPDATE shared_products SET harm = 3.3 WHERE id = '12345bcb-a4ed-49cc-93c6-af21a30f915e'; -- Сыр моцарелла Bonfesto
UPDATE shared_products SET harm = 5.3 WHERE id = '13b2d925-e9f1-495b-8328-3c8c9232256d'; -- Сыр Рикотта
UPDATE shared_products SET harm = 3.6 WHERE id = '23c3c3e9-9ebf-4086-b73a-8324b0b60e08'; -- Сыр твёрдый классический
UPDATE shared_products SET harm = 8.4 WHERE id = '310ec39d-3a68-4336-ae60-05e55e02bbe6'; -- Сырники классические
UPDATE shared_products SET harm = 4.9 WHERE id = '20a83021-0073-4a42-8dcb-891c550902fe'; -- Сырники с сахаром (творог 5)
UPDATE shared_products SET harm = 5.5 WHERE id = '08ef05ad-d5f3-41bb-a719-2b32a776eda1'; -- Сырные палочки в кляре
UPDATE shared_products SET harm = 9.1 WHERE id = '2b33cbe7-04d8-4d5b-9bd0-ff485f8b43da'; -- Сырок творожный глазированный Б.Ю. Александров
UPDATE shared_products SET harm = 6.4 WHERE id = 'c784d65e-eca8-4760-82ff-043059a36217'; -- Сэндвич с индейкой ПЕРЕК
UPDATE shared_products SET harm = 2.1 WHERE id = '0a9b4136-f77a-47bc-bb2c-b3cd063d8f67'; -- Творожный сыр 30 самокат
UPDATE shared_products SET harm = 2.2 WHERE id = 'ce509fc1-2ae1-4e85-9f6e-ede05b15ef91'; -- Творожный сыр 60
UPDATE shared_products SET harm = 0.4 WHERE id = 'd57a22f0-6894-4b95-a143-cceb790dd978'; -- Тесто фило
UPDATE shared_products SET harm = 8.4 WHERE id = '7a9af9b4-ea8d-45f0-8e04-e47ce5707f11'; -- Тефтели классические
UPDATE shared_products SET harm = 4 WHERE id = '24b1ac20-8ed2-45bb-9fc8-f57b2f52f5eb'; -- Ткемали Кинто классический
UPDATE shared_products SET harm = 1.7 WHERE id = 'f5053710-01ce-4c5b-b436-45b13e7da42c'; -- Томатный соус Arrabbiata
UPDATE shared_products SET harm = 0.1 WHERE id = 'e49de476-59b8-4ee9-a789-5f2c7c17e648'; -- Томаты в собственном соку Araks
UPDATE shared_products SET harm = 0.7 WHERE id = '35e0addf-653f-4de3-835d-ef391a3c2a71'; -- Треугольники лососевые в панировке
UPDATE shared_products SET harm = 0.2 WHERE id = '77348805-fba8-4f39-a42b-2c0a02b3f368'; -- Тушёная картошка с говядиной
UPDATE shared_products SET harm = 0 WHERE id = 'cd5f36ae-72d6-4d30-b1a0-2c91dd2701aa'; -- Удон с курицей в подливе
UPDATE shared_products SET harm = 5.3 WHERE id = '1af7f0a6-e2fd-458d-a22f-5af306fc7328'; -- Филе бедра индейки сыровяленое Sabroso Monte
UPDATE shared_products SET harm = 3.7 WHERE id = '7387436b-7575-4445-b442-ac9387d48d28'; -- Финик
UPDATE shared_products SET harm = 2.5 WHERE id = 'cfb26d08-3b12-4347-95b0-af57ad22b018'; -- Флэт уайт (150 мл молока 3,5 + 10 г сиропа карамель)
UPDATE shared_products SET harm = 3.1 WHERE id = 'c2629833-e094-4b78-b034-49d30d95f33e'; -- Форель слабосолёная Русское море
UPDATE shared_products SET harm = 0.6 WHERE id = 'a42d107f-2fd9-47e4-b93d-2b78c332521f'; -- Фрукты и ягоды (микс)
UPDATE shared_products SET harm = 3.8 WHERE id = 'fa736af9-1a9b-43e7-b2c6-3430bb41b4d3'; -- Хлеб белый
UPDATE shared_products SET harm = 3.2 WHERE id = '4f5699ce-591e-45c0-8317-8633291da03a'; -- Хлеб Сила злаков на закваске
UPDATE shared_products SET harm = 2.7 WHERE id = 'e8997cb6-a5b5-4dab-89ef-cae0629b6ec3'; -- Хлеб Солнечный (пророщ. зерно)
UPDATE shared_products SET harm = 1.5 WHERE id = '10652bdc-e36d-4167-b646-e42fad074ee8'; -- Хлеб тостовый «Премиум суперсемечковый»
UPDATE shared_products SET harm = 2.2 WHERE id = '7f1b229d-bd72-4e81-b4b8-1092a772e697'; -- Хлеб тостовый Аютинский
UPDATE shared_products SET harm = 3.6 WHERE id = '306184bf-d3f4-4ee9-b887-5b2fedc79efd'; -- Чипсы Lay''s с солью
UPDATE shared_products SET harm = 0.8 WHERE id = '34e2ab1d-7b73-4383-b56a-880ba026ae84'; -- Шампиньоны на гриле (в майонезе)
UPDATE shared_products SET harm = 6.7 WHERE id = 'b253fa56-2a14-4643-b30d-92929aa1dae9'; -- Шоколадка Super
UPDATE shared_products SET harm = 0.7 WHERE id = 'afb036be-42ee-4301-87f6-52fcdfee74ef'; -- Яблоки запечённые
UPDATE shared_products SET harm = 0.2 WHERE id = '0af02004-553d-4fd2-86e8-ed5caa556e50'; -- Яблоко
UPDATE shared_products SET harm = 5.7 WHERE id = '490a7127-3355-48f3-a13a-878eed571246'; -- Яблочная меренга с ягодами (без сахара)
UPDATE shared_products SET harm = 3.3 WHERE id = '94d4bc85-af76-46a2-a4fb-68b82be97a15'; -- Яблочный пирог

COMMIT;
