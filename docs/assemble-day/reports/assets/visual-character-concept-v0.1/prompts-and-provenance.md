# Visual Character Concept v0.1 — prompts and provenance

Дата: 2026-07-30

Все четыре preview board созданы встроенным `image_gen` в режиме `ui-mockup`.
Это исследовательские растровые артефакты, не production assets. В runtime игры
они не загружаются. Сгенерированные логотипы, hardware frames, английский copy и
детали лиц не являются принятым дизайном и не должны переноситься в код.

## Asset map

| Asset                             | Роль                                                 | SHA-256                                                            |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `01-heys-native-minimal.png`      | Concept A                                            | `01ce6d08ac20db5fb01790b454cc54b629eda306e85bf818099986460bb14dcc` |
| `02a-pocket-retro-first-pass.png` | Concept B; выбран владельцем как visual north star   | `0282dc3bdc9d451a9203faa9d696fe3894fcf739e2e73befd9924e5b1210578d` |
| `02-pocket-retro-true-8bit.png`   | Concept B2; отклонённая более жёсткая 8-bit итерация | `04a479644a57acfb7b25de0017de1ec840511a005383a1b6db2055381626a535` |
| `03-editorial-hybrid.png`         | Concept C                                            | `fa8b78b0817ad825c93b501db2495477c0ca715915290c7bda1f4477c15fc483` |

Размер каждого board: `1536×1024` PNG.

## Общая часть prompts A/B/C

```text
Use case: ui-mockup
Asset type: preview-only concept board for the HEYS “Assemble Day” adult decision game.
Primary request: Create a polished, implementation-minded UI concept board, not fantasy concept art.
Subject: one fixed neutral adult human character, gender-neutral, shown in a compact character HUD inside a calm mobile decision screen. The main mixed state must be readable as LOW ENERGY + POSITIVE MOOD + HIGH TENSION simultaneously, never collapsed into one score.
Composition: one large 390x844 mobile mockup centered, one compact desktop crop, and a small four-frame state strip showing neutral, depleted/recovering, pressured, and positive-with-tradeoff. Keep the decision/event area and the start of two options visible beneath the character HUD.
Information hierarchy: compact character scene; three independent qualitative state chips for Energy, Mood, Tension; at most one small contextual cue. No health meter, no XP, no hearts, no coins, no streak.
Brand: HEYS premium adult calmness. Deep violet #434587, pale blue #E2ECF2, soft green #DEEDDB, pale rose #F3D7D7, white, near-slate text. Light airy surfaces, thin borders, soft 20–24px radii, subtle shadows, system typography.
Accessibility intent: states differ by pose, facial geometry, line pattern, and text—not color alone. Motion is not required.
Text: Render only the board title exactly; all smaller UI text may be clean abstract typographic bars to avoid misspelled copy.
Constraints: original design; plausible inline SVG/CSS implementation; compact scene; adult and emotionally neutral; no medical diagnosis; no moral “good/bad” framing.
Avoid: Tamagotchi or Bandai characters, egg-shaped device shell, three-button toy layout, copied trade dress, children, pets, kawaii, cartoon mascot, anime, glossy 3D, neon, arcade cabinet, generic SaaS bento overload, game lives, health bar, gauges, photorealism, external logos, watermarks.
```

## A — HEYS Minimal

К общей части дословно добавлено:

```text
Text (verbatim): "A. HEYS MINIMAL"
Direction: HEYS-native premium minimal. The character is an abstract adult silhouette constructed on a subtle 16px pixel grid, mostly smooth clean shapes with only restrained crisp pixel cues. State is expressed through shoulder angle, eye line, breathing marks, and sparse environmental geometry. The scene feels editorial and premium, almost like a refined system illustration; quietest and most compatible with an Apple-like HEYS interface. No device frame.
```

## B — Pocket Retro, first pass

К общей части дословно добавлено:

```text
Text (verbatim): "B. POCKET RETRO"
Direction: adult pocket-retro. A compact original monochrome pixel scene embedded directly in the card, like a tiny calm pocket computer display, but with no physical toy shell and no recognizable commercial device silhouette. Stronger 8-bit character animation frames, restrained violet-and-soft-green LCD palette, crisp edges, understated grid. Expressive but mature, no cuteness, no nostalgia gimmicks.
```

Пользовательский feedback: «это и близку не 8бит ретро» и «b - нелохо». Вывод:
направление принято как перспективное, но pixel language был декоративным.

После прямого сравнения с B2 владелец выбрал исходный Concept B как более
удачную визуальную концепцию. Его raster board становится visual north star; это
не разрешает переносить в production телефонный mockup, английский copy или
сгенерированные UI-иконки.

## B2 — True 8-bit refinement

Итерация сохранена как evidence проверки более буквального 8-bit языка. После
сравнения владелец отклонил её в пользу более спокойного и цельного Concept B.

```text
Use case: ui-mockup
Asset type: preview-only refined concept board for HEYS “Assemble Day”.
Primary request: Redraw concept B as unmistakable real 8-bit pixel art while preserving an adult premium HEYS product interface.
Text (verbatim): "B2. TRUE 8-BIT"
Composition: flat UI design board, no photographed phone hardware. Show a 390x844 mobile screen, a desktop crop, and four sprite-state thumbnails.
Character scene: build the actual scene on a strict 64×48 logical pixel grid, enlarged by integer nearest-neighbor scaling. The adult character sprite is approximately 16×24 logical pixels. Every contour is staircase pixel blocks; no antialiasing, no vector-smooth curves, no painterly texture. Use exactly four scene colors: deep violet #434587, dark ink #29293A, pale LCD green #DEEDDB, off-white #F7F7F4. Visible sparse pixel-grid rhythm.
State logic: same mixed state LOW ENERGY + POSITIVE MOOD + HIGH TENSION. Low energy = dropped shoulders and reduced stance height; positive mood = tiny upward 3-pixel mouth and open eye pixels; high tension = dense 1-pixel vibration marks and compressed environmental lines. Keep all three independent.
UI shell: modern calm HEYS card outside the pixel scene, white surface, thin borders, subtle radius, no toy casing. Below the scene, three small qualitative chips represented by clean symbols and abstract text bars. Keep the event card and start of two decision options visible.
Four frames: neutral, depleted/recovering, pressured, positive-with-tradeoff. Each must use the same sprite identity and room geometry, only discrete pixels change.
Implementation intent: plausible single inline SVG with shape-rendering crispEdges or CSS pixel blocks, zero animation loop.
Avoid: smooth illustration, vector faces, gradients inside the scene, 3D, photorealism, iPhone frame, Tamagotchi/Bandai egg shell, three toy buttons, copied characters/icons/trade dress, cute mascot, child, pet, anime, kawaii, neon arcade, health meter, hearts, coins, XP, game-over language, watermark.
```

## C — Editorial Hybrid

К общей части дословно добавлено:

```text
Text (verbatim): "C. EDITORIAL HYBRID"
Direction: hybrid editorial. A calm identity card with a larger geometric adult portrait/silhouette, subtle pixel-halftone fragments and typographic state bands. Pose and surrounding editorial symbols carry the emotion; it is not a full sprite screen. Combine premium magazine composition, HEYS whitespace, and a small amount of original pixel texture. The most emotionally legible without looking like a toy.
```
