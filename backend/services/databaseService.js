const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.db;
    }

    const dbPath = path.join(__dirname, '..', 'database', 'database.db');
    const dbDir = path.dirname(dbPath);

    // Create database directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.isInitialized = true;
          resolve(this.db);
        }
      });
    });
  }

  getDatabase() {
    if (!this.isInitialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  // Promisify database operations for better async/await support
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database connection closed');
            this.isInitialized = false;
            resolve();
          }
        });
      });
    }
  }

  // Transaction support
  async beginTransaction() {
    await this.run('BEGIN TRANSACTION');
  }

  async commit() {
    await this.run('COMMIT');
  }

  async rollback() {
    await this.run('ROLLBACK');
  }

  // Execute multiple statements in a transaction
  async transaction(operations) {
    try {
      await this.beginTransaction();
      const results = [];
      
      for (const operation of operations) {
        const result = await operation();
        results.push(result);
      }
      
      await this.commit();
      return results;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}

// Export singleton instance
class DatabaseServiceSingleton {
  constructor() {
    if (!DatabaseServiceSingleton.instance) {
      DatabaseServiceSingleton.instance = new DatabaseService();
    }
    return DatabaseServiceSingleton.instance;
  }

  static getInstance() {
    if (!DatabaseServiceSingleton.instance) {
      DatabaseServiceSingleton.instance = new DatabaseService();
    }
    return DatabaseServiceSingleton.instance;
  }
}

module.exports = DatabaseServiceSingleton;
