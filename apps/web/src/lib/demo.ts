/**
 * Единственный экземпляр демо-шлюза на приложение.
 * Демо-режим: данные не покидают браузер, наблюдения не являются реальными.
 */
import { DemoGateway } from '../demo/gateway';

export const demoGateway = new DemoGateway();
export const demoStore = demoGateway.store;
