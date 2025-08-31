'use strict';

var zod = require('zod');

var a=zod.z.object({id:zod.z.string(),email:zod.z.string().email(),name:zod.z.string(),profile:zod.z.object({age:zod.z.number().optional(),gender:zod.z.enum(["male","female","other"]).optional(),weight:zod.z.number().optional(),height:zod.z.number().optional(),activityLevel:zod.z.enum(["sedentary","light","moderate","active","very-active"]).optional()}).optional(),preferences:zod.z.object({units:zod.z.enum(["metric","imperial"]).default("metric"),language:zod.z.enum(["en","ru"]).default("en"),theme:zod.z.enum(["light","dark","auto"]).default("auto")}).default({}),createdAt:zod.z.date(),updatedAt:zod.z.date()}),m=a.partial().omit({id:true,createdAt:true,updatedAt:true}),c=r=>{let i=new Date;return {id:crypto.randomUUID(),email:r.email,name:r.name,profile:r.profile,preferences:r.preferences||{units:"metric",language:"en",theme:"auto"},createdAt:i,updatedAt:i}};var l=zod.z.object({id:zod.z.string(),name:zod.z.string(),brand:zod.z.string().optional(),category:zod.z.string(),nutrition:zod.z.object({calories:zod.z.number(),protein:zod.z.number(),carbs:zod.z.number(),fat:zod.z.number(),fiber:zod.z.number().optional(),sugar:zod.z.number().optional(),sodium:zod.z.number().optional()}),perUnit:zod.z.object({amount:zod.z.number(),unit:zod.z.enum(["g","ml","piece","cup","tbsp","tsp"])}),createdAt:zod.z.date(),updatedAt:zod.z.date()}),g=zod.z.object({id:zod.z.string(),userId:zod.z.string(),productId:zod.z.string(),amount:zod.z.number(),unit:zod.z.string(),date:zod.z.date(),meal:zod.z.enum(["breakfast","lunch","dinner","snack"]),createdAt:zod.z.date()}),f=(r,i)=>{let n=i/r.perUnit.amount;return {calories:Math.round(r.nutrition.calories*n*10)/10,protein:Math.round(r.nutrition.protein*n*10)/10,carbs:Math.round(r.nutrition.carbs*n*10)/10,fat:Math.round(r.nutrition.fat*n*10)/10,fiber:r.nutrition.fiber?Math.round(r.nutrition.fiber*n*10)/10:void 0,sugar:r.nutrition.sugar?Math.round(r.nutrition.sugar*n*10)/10:void 0,sodium:r.nutrition.sodium?Math.round(r.nutrition.sodium*n*10)/10:void 0}};var y=zod.z.object({id:zod.z.string(),name:zod.z.string(),category:zod.z.enum(["strength","cardio","flexibility","balance","sport"]),muscleGroups:zod.z.array(zod.z.string()),equipment:zod.z.string().optional(),instructions:zod.z.string().optional(),difficulty:zod.z.enum(["beginner","intermediate","advanced"])}),s=zod.z.object({exerciseId:zod.z.string(),reps:zod.z.number().optional(),weight:zod.z.number().optional(),duration:zod.z.number().optional(),distance:zod.z.number().optional(),rest:zod.z.number().optional()}),h=zod.z.object({id:zod.z.string(),userId:zod.z.string(),name:zod.z.string(),date:zod.z.date(),sets:zod.z.array(s),notes:zod.z.string().optional(),duration:zod.z.number(),createdAt:zod.z.date()}),S=zod.z.object({id:zod.z.string(),name:zod.z.string(),description:zod.z.string(),duration:zod.z.number(),sessions:zod.z.array(zod.z.object({name:zod.z.string(),exercises:zod.z.array(zod.z.object({exerciseId:zod.z.string(),sets:zod.z.number(),reps:zod.z.string(),weight:zod.z.string().optional()}))})),level:zod.z.enum(["beginner","intermediate","advanced"]),createdAt:zod.z.date()});var k={calculateCalories:()=>0};var F={track:()=>{}};var D={save:()=>Promise.resolve(),load:()=>Promise.resolve(null)};

exports.AnalyticsService = F;
exports.ExerciseSchema = y;
exports.FoodEntrySchema = g;
exports.FoodProductSchema = l;
exports.NutritionService = k;
exports.StorageService = D;
exports.TrainingProgramSchema = S;
exports.UserDraftSchema = m;
exports.UserSchema = a;
exports.WorkoutSessionSchema = h;
exports.WorkoutSetSchema = s;
exports.calculateNutrition = f;
exports.createUser = c;
//# sourceMappingURL=out.js.map
//# sourceMappingURL=index.cjs.map