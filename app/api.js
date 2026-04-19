'use strict';

const api = {
  async files()         { return fetch('/api/files').then(r => r.json()); },
  async load(name)      { return fetch(`/api/load/${encodeURIComponent(name)}`).then(r => r.json()); },
  async save(name, doc) {
    return fetch(`/api/save/${encodeURIComponent(name)}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(doc)
    }).then(r => r.json());
  },
  async create(name) {
    return fetch('/api/new', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})
    }).then(r => r.json());
  },
  async del(name) {
    return fetch(`/api/delete/${encodeURIComponent(name)}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'
    }).then(r => r.json());
  },
  async exportMd(name) { return fetch(`/api/export/${encodeURIComponent(name)}`).then(r => r.text()); },
  async exportJson(name) { return this.load(name); }
};
