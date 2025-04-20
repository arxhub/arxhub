import MemoryAdapter from 'pouchdb-adapter-memory'
import PouchDB from 'pouchdb-core'
import Find from 'pouchdb-find'

PouchDB.plugin(MemoryAdapter)
PouchDB.plugin(Find)

export default PouchDB
