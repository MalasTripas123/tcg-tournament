const session = require('express-session');
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  _id: String,
  session: mongoose.Schema.Types.Mixed,
  expires: { type: Date, index: { expires: 0 } },
}, {
  versionKey: false,
});

const SessionModel = mongoose.models.AppSession || mongoose.model('AppSession', sessionSchema);

class MongoSessionStore extends session.Store {
  get(sid, callback) {
    SessionModel.findById(sid).lean()
      .then(doc => {
        if (!doc) return callback(null, null);
        if (doc.expires && doc.expires <= new Date()) {
          return SessionModel.deleteOne({ _id: sid })
            .then(() => callback(null, null))
            .catch(callback);
        }
        return callback(null, doc.session);
      })
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    SessionModel.findByIdAndUpdate(
      sid,
      {
        session: sessionData,
        expires: sessionExpiry(sessionData),
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }

  destroy(sid, callback) {
    SessionModel.deleteOne({ _id: sid })
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }

  touch(sid, sessionData, callback) {
    SessionModel.updateOne(
      { _id: sid },
      { $set: { expires: sessionExpiry(sessionData) } }
    )
      .then(() => callback?.(null))
      .catch(error => callback?.(error));
  }
}

function sessionExpiry(sessionData) {
  if (sessionData?.cookie?.expires) return new Date(sessionData.cookie.expires);
  const maxAge = sessionData?.cookie?.originalMaxAge || 24 * 60 * 60 * 1000;
  return new Date(Date.now() + maxAge);
}

function createMongoSessionStore() {
  return new MongoSessionStore();
}

module.exports = { createMongoSessionStore };
