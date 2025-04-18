import MemoryAdapter from 'pouchdb-adapter-memory'
import PouchDB from 'pouchdb-core'

PouchDB.plugin(MemoryAdapter)

export default PouchDB
