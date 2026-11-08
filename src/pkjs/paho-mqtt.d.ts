declare module 'paho-mqtt' {
  export const Client: new (url: string, clientId: string) => import('./platform.js').MqttClient;
}
