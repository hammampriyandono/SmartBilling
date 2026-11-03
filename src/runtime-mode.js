import {sensorTopics,productionSensorTopic} from './sensor-message.js';
import {rfidTopics,productionRfidTopic} from './rfid-message.js';
import {rfidStatusTopic} from './rfid-status.js';
import {roomRelayStatusTopic} from './room-relay-protocol.js';
export function dataMode(value='archive') {
 if(!['archive','operational'].includes(value))throw new Error('invalid_data_mode');
 return value;
}
export function subscribedTopics(mode,testTopic,{roomRelay=false}={}) {
 const topics=dataMode(mode)==='operational'?[productionSensorTopic,productionRfidTopic,rfidStatusTopic]:[testTopic,...sensorTopics,...rfidTopics,rfidStatusTopic];
 return roomRelay?[...topics,roomRelayStatusTopic]:topics;
}
