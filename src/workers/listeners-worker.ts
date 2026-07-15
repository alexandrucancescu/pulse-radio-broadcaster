import ListenerStats from '../stats/ListenerStats.js'
import { initializeRpcMethods } from './worker-rpc.js'
import { initDb } from '../db/index.js'

const db = initDb()
const listenerStats = new ListenerStats(db)

initializeRpcMethods(listenerStats)
