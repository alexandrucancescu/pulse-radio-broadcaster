import ListenerStats from '../stats/ListenerStats.js'
import { initializeRpcMethods } from './worker-rpc.js'

const listenerStats = new ListenerStats()

initializeRpcMethods(listenerStats)
