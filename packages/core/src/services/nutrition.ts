// Nutrition service
export interface NutritionData {
  proteins: number; // g
  carbs: number; // g
  fats: number; // g
  weight?: number; // g
}

export interface CalorieCalculationOptions {
  proteinMultiplier?: number; // kcal/g (default: 4)
  carbMultiplier?: number; // kcal/g (default: 4)
  fatMultiplier?: number; // kcal/g (default: 9)
}

export class NutritionService {
  private static readonly DEFAULT_MULTIPLIERS = {
    proteins: 4,
    carbs: 4,
    fats: 9,
  };

  static calculateCalories(data: NutritionData, options: CalorieCalculationOptions = {}): number {
    const {
      proteinMultiplier = this.DEFAULT_MULTIPLIERS.proteins,
      carbMultiplier = this.DEFAULT_MULTIPLIERS.carbs,
      fatMultiplier = this.DEFAULT_MULTIPLIERS.fats,
    } = options;

    return (
      data.proteins * proteinMultiplier + data.carbs * carbMultiplier + data.fats * fatMultiplier
    );
  }

  static calculateMacroRatio(data: NutritionData): {
    proteinsPercent: number;
    carbsPercent: number;
    fatsPercent: number;
  } {
    const totalCalories = this.calculateCalories(data);

    if (totalCalories === 0) {
      return { proteinsPercent: 0, carbsPercent: 0, fatsPercent: 0 };
    }

    return {
      proteinsPercent: Math.round(((data.proteins * 4) / totalCalories) * 100),
      carbsPercent: Math.round(((data.carbs * 4) / totalCalories) * 100),
      fatsPercent: Math.round(((data.fats * 9) / totalCalories) * 100),
    };
  }

  static validateNutritionData(data: NutritionData): boolean {
    return (
      typeof data.proteins === 'number' &&
      data.proteins >= 0 &&
      typeof data.carbs === 'number' &&
      data.carbs >= 0 &&
      typeof data.fats === 'number' &&
      data.fats >= 0 &&
      (data.weight === undefined || (typeof data.weight === 'number' && data.weight > 0))
    );
  }
}
