const fs = require('fs');
const file = '/Users/poplavskijanton/HEYS-v2/apps/landing/src/components/sections/TrustSection.tsx';
let txt = fs.readFileSync(file, 'utf8');

// We need to inject useState and toggle logic.
if (!txt.includes('useState')) {
    txt = txt.replace("import { useEffect, useRef } from 'react'", "import { useEffect, useRef, useState } from 'react'");
}

// Find the start of TrustSection component
const sectionMatch = txt.match(/export default function TrustSection\(\) \{[\s\S]*?const \[isVisible, setIsVisible\] = useState\(false\)/);
if (sectionMatch) {
    const updatedState = sectionMatch[0] + "\n    const [activeVariant, setActiveVariant] = useState<1 | 2>(1)";
    txt = txt.replace(sectionMatch[0], updatedState);
}

// Find the 'Доказательная база алгоритмов' wrapper div and text
const targetHtml = `<div
                        className={\`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out \${isVisible ? 'opacity-100 translate-y-0' : 'opa                        className={\`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 trel                        className={\
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                            Доказательная база алгоритмов
                        </h3>
                        <p className="text-gray-600                        <p className="text-gray-600                        <p className="text-gray-600                        <p classN�пирается на а                        <p className="text-gray-600                        <p className="text-gray-600    Система глубоко анализирует каскадные взаимосвязи между сном, уровнем стресса, составом питания и вашей активностью. 
                            Здесь нет «уникальных авторских диет» — только сухая физиология и биохимия, переведённая в понятные и своевременные рекомендации для вас.
                            Здесь нет «уникальных автор
                                                                                              md:p-8 mb-6 transition-all dura                                                                                              md:p-8 mb-6 transition-all dura                                                                                              md:p-8 mb-6 transition-all dura                                                                                              md:p-8 mb-6 transition-all dura                                                                                              md:p-8 mb-6 transition-all dura                                 Click={() => setActiveVariant(1)}
                                className={\`text-[10px] font-bold px-3 py-1 rounded-full transition-all \${activeVariant === 1 ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}\`}
                            >
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    их диет»
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказка сис                         я н                                    Каждая подсказ�лы воли
                                </h3                                </h3                                </h3laxed">
                                    За каждой рекомендацией HEYS стоят тысячи актуальных клинических исследований (PubMed). Система видит скрытые каскады: как вчерашний стресс запускает сегодняшнюю тягу к перееданию. Никакой магии и мифов из интернета — только точные законы физиологии, переведённые в понятные и своевременные для вас шаги.
                                </p>
                            </>
                        )}
                    </div>`;

txt = txt.replace(targetHtml, abHtml);

fs.writeFileSync(file, txt);
console.log("A/B variant toggle injected successfully!");
