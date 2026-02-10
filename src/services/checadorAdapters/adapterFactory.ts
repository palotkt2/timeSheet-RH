import type { Plant } from '@/types';
import { BaseAdapter } from './baseAdapter';
import { SameAppAdapter } from './sameAppAdapter';
import { GenericAdapter } from './genericAdapter';

/**
 * Factory that returns the appropriate adapter instance based on adapter_type.
 */
export function createAdapter(plantConfig: Plant): BaseAdapter {
  switch (plantConfig.adapter_type) {
    case 'same-app':
      return new SameAppAdapter(plantConfig);
    case 'generic':
    default:
      return new GenericAdapter(plantConfig);
  }
}
