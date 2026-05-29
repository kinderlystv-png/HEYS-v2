/**
 * 🏗️ ESLint Rule: no-setstate-side-effects-in-reducer
 *
 * Detects React anti-pattern: `setX(prev => { ...sideEffect()... return next })`.
 *
 * Контекст (incident 2026-05-29 / commits f23aa6a2, cfd9d013):
 * React 18 updateReducer повторно прогоняет pending updater'ы при каждом render
 * (особенно под StrictMode dev — 2× amplification). Side effects (lsSet,
 * saveClientKey, fetch, dispatch и т.д.) ВНУТРИ setState reducer'a вызываются
 * многократно — отсюда loops (dayv2 200/30c, advice_trace 47/30c).
 *
 * Правильный pattern (см. steps_v1.js:264, _meals.js):
 *   const baseDay = dayRef.current; // или lsGet
 *   const next = compute(baseDay);
 *   sideEffect(next);             // ← ВНЕ reducer
 *   setX(() => next);             // ← pure update
 *
 * Detected anti-patterns (this rule fires):
 *   setDay(prev => {              // ← arrow function as updater
 *     const next = mutate(prev);
 *     lsSet(key, next);          // ← FIRES
 *     return next;
 *   });
 *
 * Whitelisted (NOT detected):
 *   setDay(() => preComputed);    // ← () => ... (no args = no reducer pattern)
 *   setDay(newValue);             // ← direct value
 *   setDay(prev => mutate(prev)); // ← no side effects inside
 *
 * Side-effect functions detected:
 *   - lsSet, store.set, localStorage.setItem
 *   - saveClientKey, saveKey, persistDayData, scheduleDayFlush
 *   - HEYS.utils.lsSet, HEYS.store.set
 *   - fetch, axios, .post(, .put(
 *   - dispatchEvent, dispatch, emit
 *
 * Setter function patterns detected (`set[A-Z]\w+`):
 *   setDay, setMeals, setProducts, etc.
 *
 * @type {import('eslint').Rule.RuleModule}
 */

const SETTER_NAME_RE = /^set[A-Z]\w*$/;

// Identifier names which (if called as functions) are considered side-effects.
const SIDE_EFFECT_IDENTIFIERS = new Set([
    'lsSet',
    'saveClientKey',
    'saveKey',
    'persistDayData',
    'scheduleDayFlush',
    'fetch',
    'axios',
    'dispatchEvent',
    'emit',
]);

// Patterns like X.localStorage.setItem, store.set, HEYS.utils.lsSet etc.
const SIDE_EFFECT_PROPERTY_NAMES = new Set([
    'setItem',
    'set',           // store.set, HEYS.store.set
    'lsSet',         // HEYS.utils.lsSet
    'saveClientKey',
    'saveKey',
    'post',
    'put',
    'patch',
    'delete',        // axios.delete etc.
    'dispatch',
    'dispatchEvent',
]);

function isSideEffectCall(callExpr) {
    const callee = callExpr.callee;
    if (!callee) return false;

    // Direct identifier: fetch(), lsSet(), etc.
    if (callee.type === 'Identifier') {
        return SIDE_EFFECT_IDENTIFIERS.has(callee.name);
    }

    // Member expression: store.set(), localStorage.setItem(), HEYS.utils.lsSet().
    if (callee.type === 'MemberExpression') {
        const prop = callee.property;
        if (!prop) return false;
        if (prop.type === 'Identifier' && SIDE_EFFECT_PROPERTY_NAMES.has(prop.name)) {
            return true;
        }
    }
    return false;
}

// Keys в ESLint AST nodes которые НЕ являются child nodes (metadata, cycles).
const NON_AST_KEYS = new Set([
    'parent', 'loc', 'range', 'start', 'end', 'tokens', 'comments',
    'leadingComments', 'trailingComments', 'innerComments',
    'sourceType', 'directive', 'raw',
]);

function findSideEffectsInBody(body, context, sideEffectsFound) {
    if (!body) return;
    const visited = new WeakSet();
    const visit = (node, depth = 0) => {
        if (!node || typeof node !== 'object') return;
        if (visited.has(node)) return;
        visited.add(node);
        if (depth > 100) return; // safety net
        // Skip nested function/arrow bodies — их updater callback не вызывает.
        if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration' ||
            node.type === 'ArrowFunctionExpression') {
            if (node !== body) return; // не заглубляемся в вложенные функции
        }
        if (node.type === 'CallExpression' && isSideEffectCall(node)) {
            sideEffectsFound.push(node);
        }
        for (const key of Object.keys(node)) {
            if (NON_AST_KEYS.has(key)) continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const item of val) visit(item, depth + 1);
            } else if (val && typeof val === 'object' && val.type) {
                visit(val, depth + 1);
            }
        }
    };
    visit(body);
}

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Запрещает side-effects (lsSet, saveClientKey, fetch, dispatch и т.д.) ' +
                'внутри setState reducerа — React 18 updateReducer прогоняет updater многократно, ' +
                'это создаёт loops (dayv2 200/30с, advice_trace 47/30с — incident 2026-05-29).',
            recommended: true,
        },
        schema: [
            {
                type: 'object',
                properties: {
                    additionalSetters: { type: 'array', items: { type: 'string' } },
                    additionalSideEffects: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            sideEffectInReducer:
                "Side-effect '{{ callName }}' внутри setState reducerа ({{ setter }}). " +
                'React 18 повторно прогоняет updater многократно → effect fires N раз. ' +
                'Pattern fix: pre-read state через ref/lsGet, persist OUTSIDE setX, ' +
                'setX(() => precomputed). См. heys_steps_v1.js:264 (P0 guard pattern), ' +
                'incident commits: f23aa6a2 (12 reducers), cfd9d013 (addProductToMeal).',
        },
    },

    create(context) {
        const options = context.options[0] || {};
        const additionalSetters = new Set(options.additionalSetters || []);
        const additionalSideEffects = new Set(options.additionalSideEffects || []);

        // Merge additional side effects into our sets.
        for (const id of additionalSideEffects) {
            SIDE_EFFECT_IDENTIFIERS.add(id);
            SIDE_EFFECT_PROPERTY_NAMES.add(id);
        }

        return {
            CallExpression(node) {
                // Is this a call to a setter (setX function)?
                const callee = node.callee;
                if (!callee || callee.type !== 'Identifier') return;
                const setterName = callee.name;
                if (!SETTER_NAME_RE.test(setterName) && !additionalSetters.has(setterName)) return;

                // Check first argument: должен быть ArrowFunctionExpression с params.length >= 1
                // (т.е. updater form `prev => {...}`). Если без params (`() => ...`) — это
                // pure update, allowed.
                const arg = node.arguments[0];
                if (!arg || arg.type !== 'ArrowFunctionExpression') return;
                if (!arg.params || arg.params.length === 0) return;

                // Walk body, find side-effect CallExpressions.
                const sideEffectsFound = [];
                findSideEffectsInBody(arg.body, context, sideEffectsFound);

                for (const sideEffect of sideEffectsFound) {
                    let callName = 'unknown';
                    if (sideEffect.callee.type === 'Identifier') {
                        callName = sideEffect.callee.name;
                    } else if (sideEffect.callee.type === 'MemberExpression') {
                        const obj = sideEffect.callee.object;
                        const prop = sideEffect.callee.property;
                        callName = `${obj && obj.name ? obj.name + '.' : '...'}${prop && prop.name ? prop.name : '?'}`;
                    }
                    context.report({
                        node: sideEffect,
                        messageId: 'sideEffectInReducer',
                        data: { setter: setterName, callName },
                    });
                }
            },
        };
    },
};
