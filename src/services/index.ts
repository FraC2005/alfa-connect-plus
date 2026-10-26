import { Platform } from 'react-native';

import { RealVehicleService } from './real-vehicle-service';
import type { VehicleService } from './types';
import { WebVehicleService } from './web-vehicle-service';

/**
 * The ONE place where the service is chosen. Phones talk to the car's cloud directly; the web build
 * cannot (CORS, forbidden headers), so it goes through the local proxy started by `npm run web:real`.
 */
export const vehicleService: VehicleService = Platform.OS === 'web' ? new WebVehicleService() : new RealVehicleService();
