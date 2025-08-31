// Food and Nutrition Models - Migrated from legacy core
import { z } from 'zod';

// Food Product Schema
export const FoodProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().optional(),
  category: z.string(),
  nutrition: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    fiber: z.number().optional(),
    sugar: z.number().optional(),
    sodium: z.number().optional(),
  }),
  perUnit: z.object({
    amount: z.number(),
    unit: z.enum(['g', 'ml', 'piece', 'cup', 'tbsp', 'tsp']),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FoodProduct = z.infer<typeof FoodProductSchema>;

// Food Entry Schema (diary entry)
export const FoodEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  productId: z.string(),
  amount: z.number(),
  unit: z.string(),
  date: z.date(),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  createdAt: z.date(),
});

export type FoodEntry = z.infer<typeof FoodEntrySchema>;

// Nutrition calculations
export const calculateNutrition = (
  product: FoodProduct,
  amount: number
): FoodProduct['nutrition'] => {
  const ratio = amount / product.perUnit.amount;
  return {
    calories: Math.round(product.nutrition.calories * ratio * 10) / 10,
    protein: Math.round(product.nutrition.protein * ratio * 10) / 10,
    carbs: Math.round(product.nutrition.carbs * ratio * 10) / 10,
    fat: Math.round(product.nutrition.fat * ratio * 10) / 10,
    fiber: product.nutrition.fiber
      ? Math.round(product.nutrition.fiber * ratio * 10) / 10
      : undefined,
    sugar: product.nutrition.sugar
      ? Math.round(product.nutrition.sugar * ratio * 10) / 10
      : undefined,
    sodium: product.nutrition.sodium
      ? Math.round(product.nutrition.sodium * ratio * 10) / 10
      : undefined,
  };
};
