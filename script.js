// server.js
// Single-file example: Express + SQLite backend, serves an AngularJS (1.x) SPA.
// Node v12+ recommended.

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = 3000;

// create/open SQLite DB file
const DB_FILE = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('DB open error', err);
  console.log('Connected to SQLite DB:', DB_FILE);
});

// Ensure table exists
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    qty INTEGER DEFAULT 1
  )`);
});

// Middleware
app.use(express.json()); // parse JSON bodies

// Serve SPA HTML at root
app.get('/', (req, res) => {
  // single HTML string containing AngularJS app
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!doctype html>
<html ng-app="demoApp">
<head>
  <meta charset="utf-8">
  <title>AngularJS + SQLite Demo (single file)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; max-width:900px; margin:20px auto; }
    header { display:flex; align-items:center; gap:12px; }
    input, button { padding:8px; font-size:14px; }
    table { width:100%; border-collapse: collapse; margin-top:12px; }
    th, td { border:1px solid #ddd; padding:8px; text-align:left; }
    tr:nth-child(even) { background:#f9f9f9; }
    .row { display:flex; gap:8px; margin-top:8px; }
    .small { width:80px; }
  </style>
  <script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js"></script>
</head>
<body ng-controller="MainCtrl as vm">
  <header>
    <h1>Simple AngularJS + SQLite Demo</h1>
  </header>

  <section>
    <form ng-submit="vm.addItem()">
      <div class="row">
        <input type="text" ng-model="vm.newItem.name" placeholder="Item name" required />
        <input type="number" class="small" ng-model="vm.newItem.qty" min="1" required />
        <button type="submit">Add</button>
        <button type="button" ng-click="vm.load()" style="margin-left:8px">Refresh</button>
      </div>
    </form>

    <table ng-if="vm.items.length">
      <thead>
        <tr><th>ID</th><th>Name</th><th>Qty</th><th>Actions</th></tr>
      </thead>
      <tbody>
        <tr ng-repeat="it in vm.items">
          <td>{{it.id}}</td>
          <td>
            <span ng-if="!it.editing">{{it.name}}</span>
            <input ng-if="it.editing" ng-model="it.name" />
          </td>
          <td>
            <span ng-if="!it.editing">{{it.qty}}</span>
            <input ng-if="it.editing" type="number" ng-model="it.qty" min="1" />
          </td>
          <td>
            <button ng-if="!it.editing" ng-click="vm.startEdit(it)">Edit</button>
            <button ng-if="it.editing" ng-click="vm.saveEdit(it)">Save</button>
            <button ng-click="vm.delete(it.id)" style="margin-left:6px">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <p ng-if="!vm.items.length">No items yet.</p>
  </section>

  <script>
    angular.module('demoApp', [])
      .controller('MainCtrl', ['$http', function($http){
        const vm = this;
        vm.items = [];
        vm.newItem = { name: '', qty: 1 };

        vm.load = function(){
          $http.get('/api/items').then(res => vm.items = res.data).catch(err => {
            console.error(err);
            alert('Failed to load items');
          });
        };

        vm.addItem = function(){
          if(!vm.newItem.name) return;
          $http.post('/api/items', vm.newItem)
            .then(() => {
              vm.newItem = { name: '', qty: 1 };
              vm.load();
            })
            .catch(err => { console.error(err); alert('Add failed'); });
        };

        vm.delete = function(id){
          if(!confirm('Delete item #' + id + '?')) return;
          $http.delete('/api/items/' + id)
            .then(() => vm.load())
            .catch(err => { console.error(err); alert('Delete failed'); });
        };

        vm.startEdit = function(it){
          it._backup = { name: it.name, qty: it.qty };
          it.editing = true;
        };

        vm.saveEdit = function(it){
          $http.put('/api/items/' + it.id, { name: it.name, qty: it.qty })
            .then(() => { it.editing = false; vm.load(); })
            .catch(err => {
              console.error(err);
              alert('Update failed');
              // restore on fail
              it.name = it._backup.name;
              it.qty = it._backup.qty;
              it.editing = false;
            });
        };

        // initial load
        vm.load();
      }]);
  </script>
</body>
</html>`);
});

// REST API for items
app.get('/api/items', (req, res) => {
  db.all('SELECT id, name, qty FROM items ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/items', (req, res) => {
  const { name, qty } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const q = 'INSERT INTO items (name, qty) VALUES (?, ?)';
  db.run(q, [name, qty || 1], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID });
  });
});

app.put('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, qty } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run('UPDATE items SET name = ?, qty = ? WHERE id = ?', [name, qty || 1, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ updated: true });
  });
});

app.delete('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM items WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: true });
  });
});

// start server
app.listen(PORT, () => {
  console.log('Server listening on http://localhost:' + PORT);
});