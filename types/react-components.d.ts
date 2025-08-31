// types/react-components.d.ts - React компоненты и их props

import * as React from 'react';
import { Product, Meal, UserProfile, Client, PulseZone, Norms } from './heys';

// === Calendar Component ===
export interface CalendarProps {
  valueISO: string;
  onSelect: (date: string) => void;
  onRemove: () => void;
}

// === Product Search Component ===
export interface MealAddProductProps {
  mi: number; // meal index
}

// === Row Components for Reports ===
export interface RowViewProps {
  row: any;
  profile: UserProfile;
}

export interface AvgRowProps {
  avg: any;
  label?: string;
  highlight?: boolean;
}

export interface WeekTableProps {
  title: string;
  rows: any[];
  tone?: string;
}

// === Chart Components ===
export interface CalorieChartProps {
  week1Data: any[];
}

export interface ChartsBlockProps {
  rows28: any[];
}

// === Form Components ===
export interface UserTabBaseProps {
  // Empty for now, может быть расширен
}

export interface NormsCardProps {
  // Empty for now
}

// === Modal Components ===
export interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
}

// === Training Components ===
export interface TrainingCardProps {
  index: number;
  training: {
    z: [number, number, number, number];
  };
  onUpdate: (zoneIndex: number, minutes: number) => void;
}

// === Meal Components ===
export interface MealCardProps {
  meal: Meal;
  index: number;
  onUpdate: (mealIndex: number, updates: Partial<Meal>) => void;
  onDelete: (mealIndex: number) => void;
  products: Product[];
}

export interface MealItemRowProps {
  item: any;
  mealIndex: number;
  onUpdateGrams: (mealIndex: number, itemId: string, grams: number) => void;
  onRemoveItem: (mealIndex: number, itemId: string) => void;
}

// === Client Management ===
export interface ClientSelectorProps {
  clients: Client[];
  selectedClientId: string;
  onSelectClient: (clientId: string) => void;
  onCreateClient: (name: string) => void;
  onRenameClient: (clientId: string, newName: string) => void;
  onDeleteClient: (clientId: string) => void;
}

// === Profile Components ===
export interface ProfileFieldProps {
  label: string;
  value: string | number;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  onChange: (value: string | number) => void;
}

export interface PulseZoneEditorProps {
  zones: PulseZone[];
  onUpdateZone: (index: number, updates: Partial<PulseZone>) => void;
  onResetZones: () => void;
  maxHR: number;
}

// === Suggest/Autocomplete ===
export interface SuggestProps {
  query: string;
  onQueryChange: (query: string) => void;
  suggestions: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
}

// === Statistics Components ===
export interface DaySummaryProps {
  day: any;
  norms: Norms;
  profile: UserProfile;
}

export interface NutritionTableProps {
  meals: Meal[];
  products: Product[];
  onUpdateMeal: (mealIndex: number, updates: Partial<Meal>) => void;
}

// === Performance Components ===
export interface PerformanceMonitorProps {
  enabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// === Error Boundary ===
export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// === Storage Components ===
export interface StorageStatusProps {
  status: 'synced' | 'saving' | 'error' | 'offline';
  lastSync?: Date;
}

// === Utility Components ===
export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
}

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

// === Virtual List (для больших списков продуктов) ===
export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

export interface VirtualListState {
  scrollTop: number;
  startIndex: number;
  endIndex: number;
}
