// Training Models - New structure for workout management
import { z } from 'zod';

// Exercise Schema
export const ExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['strength', 'cardio', 'flexibility', 'balance', 'sport']),
  muscleGroups: z.array(z.string()),
  equipment: z.string().optional(),
  instructions: z.string().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
});

export type Exercise = z.infer<typeof ExerciseSchema>;

// Workout Set Schema
export const WorkoutSetSchema = z.object({
  exerciseId: z.string(),
  reps: z.number().optional(),
  weight: z.number().optional(),
  duration: z.number().optional(), // in seconds
  distance: z.number().optional(), // in meters
  rest: z.number().optional(), // rest time in seconds
});

export type WorkoutSet = z.infer<typeof WorkoutSetSchema>;

// Workout Session Schema
export const WorkoutSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  date: z.date(),
  sets: z.array(WorkoutSetSchema),
  notes: z.string().optional(),
  duration: z.number(), // total workout duration in seconds
  createdAt: z.date(),
});

export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;

// Training Program Schema
export const TrainingProgramSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  duration: z.number(), // program duration in weeks
  sessions: z.array(
    z.object({
      name: z.string(),
      exercises: z.array(
        z.object({
          exerciseId: z.string(),
          sets: z.number(),
          reps: z.string(), // e.g., "8-12", "30 sec"
          weight: z.string().optional(), // e.g., "bodyweight", "60% 1RM"
        })
      ),
    })
  ),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  createdAt: z.date(),
});

export type TrainingProgram = z.infer<typeof TrainingProgramSchema>;
