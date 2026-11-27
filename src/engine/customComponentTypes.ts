import { IllustrationSceneIcon } from './types';

export type VectorCategory = 'life' | 'grammar' | 'vocab' | 'pronunciation' | 'dialogue';

export interface VectorPrimitive {
  shape: 'rect' | 'pill' | 'circle' | 'ellipse' | 'line' | 'arc' | 'polygon' | 'text' | 'arrow' | 'icon';
  x?: number; // Relative to center (-380 .. 380)
  y?: number; // Relative to center (-155 .. 155)
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x2?: number;
  y2?: number;
  points?: Array<[number, number]>;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
  align?: 'left' | 'center' | 'right';
  icon?: IllustrationSceneIcon;
  opacity?: number;
  shadow?: boolean;
}

export interface CustomComponentDefinition {
  variant: string;
  label: string;
  category: VectorCategory;
  description: string;
  keywords: string[];
  defaultIcon: IllustrationSceneIcon;
  primitives: VectorPrimitive[];
  updatedAt?: string;
  isBuiltInOverride?: boolean;
}

export interface CustomComponentDatabasePayload {
  components: CustomComponentDefinition[];
  deletedBuiltIns: string[];
}
