'use strict';

/**
 * MCP ToolAnnotations для Claude Connectors.
 *
 * Без них Claude считает каждый tool «write / ask each time» (дефолты спеки:
 * readOnlyHint=false, destructiveHint=true). На Claude mobile в диалоге только
 * «Allow once» / «Deny» — Always allow живёт в Customize → Connectors на веб/
 * Desktop. Аннотации кладут чтение в группу Read-only (один Always allow на
 * группу) и не помечают additive-записи как destructive.
 *
 * Это hints для UI, не security boundary (MCP spec).
 *
 * Список дневниковых writes дублирует WRITE_TOOLS в tools.js (без require):
 * иначе цикл tools ↔ annotations при annotate на загрузке модуля. Тест
 * tool-annotations.test сверяет оба Set.
 */

/** Пишущие heys_* дневника (= WRITE_TOOLS в tools.js). */
const DIARY_WRITE_TOOLS = new Set([
  'heys_log_meal',
  'heys_update_meal',
  'heys_delete_meal',
  'heys_add_water',
  'heys_log_training',
  'heys_log_strength_workout',
  'heys_assign_training',
  'heys_assign_program',
  'heys_propose_training_edit',
  'heys_move_training',
  'heys_withdraw_training_proposal',
  'heys_update_training',
  'heys_delete_training',
  'heys_update_day',
  'heys_checkin',
  'heys_update_profile',
  'heys_update_norms',
  'heys_update_hr_zones',
  'heys_create_product',
  'heys_update_product',
  'heys_reapply_recipe',
  'heys_delete_product',
  'heys_save_meal_preset',
  'heys_delete_meal_preset',
]);

/** Пишущие tasks_* (не входят в WRITE_TOOLS дневника). */
const TASKS_WRITE_TOOLS = new Set([
  'tasks_capture',
  'tasks_update',
  'tasks_append',
  'tasks_checkpoint',
  'tasks_patch',
  'tasks_habit',
  'tasks_slot',
  'tasks_slot_done',
  'tasks_unslot',
  'tasks_reslot',
  'tasks_close_day',
  'tasks_money',
  'tasks_subtask',
  'tasks_attach',
  'tasks_resolve',
  'tasks_decision',
  'tasks_vote',
  'tasks_learn',
  'tasks_move',
  'tasks_link',
  'tasks_review',
  'tasks_proposal',
  'tasks_standup',
  'tasks_remind',
  'tasks_quick',
  'tasks_orders',
  'tasks_idea',
]);

/** Кураторские admin/messenger writes вне WRITE_TOOLS. */
const CURATOR_WRITE_TOOLS = new Set([
  'heys_reply_message',
  'heys_mark_message_done',
  'heys_leads',
  'heys_trial_queue',
  'heys_manage_subscription',
  'heys_client_access',
  'heys_create_client',
  'heys_moderate_products',
]);

/** Удаление / необратимый сброс — Write/delete с destructive. */
const DESTRUCTIVE_TOOLS = new Set([
  'heys_delete_meal',
  'heys_delete_product',
  'heys_delete_meal_preset',
  'heys_client_access',
  'heys_manage_subscription',
  'heys_moderate_products',
  'tasks_unslot',
]);

/** Действие уходит наружу (мессенджер клиенту и т.п.). */
const OPEN_WORLD_TOOLS = new Set([
  'heys_reply_message',
]);

function isWriteTool(name) {
  return DIARY_WRITE_TOOLS.has(name)
    || TASKS_WRITE_TOOLS.has(name)
    || CURATOR_WRITE_TOOLS.has(name);
}

function annotateToolSchema(schema) {
  if (!schema || typeof schema !== 'object' || !schema.name) return schema;
  if (schema.annotations && typeof schema.annotations === 'object') return schema;
  const name = schema.name;
  const write = isWriteTool(name);
  return {
    ...schema,
    annotations: {
      readOnlyHint: !write,
      destructiveHint: DESTRUCTIVE_TOOLS.has(name),
      idempotentHint: !write,
      openWorldHint: OPEN_WORLD_TOOLS.has(name),
    },
  };
}

function annotateToolSchemas(schemas) {
  if (!Array.isArray(schemas)) return schemas;
  return schemas.map(annotateToolSchema);
}

module.exports = {
  annotateToolSchema,
  annotateToolSchemas,
  DIARY_WRITE_TOOLS,
  TASKS_WRITE_TOOLS,
  CURATOR_WRITE_TOOLS,
  DESTRUCTIVE_TOOLS,
  OPEN_WORLD_TOOLS,
  isWriteTool,
};
