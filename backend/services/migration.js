const fs = require('fs');
const path = require('path');
const databaseService = require('./database');

class MigrationService {
  constructor() {
    this.migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
    this.migrationTableName = 'schema_migrations';
  }

  async initialize() {
    // Create migration tracking table
    await databaseService.run(`
      CREATE TABLE IF NOT EXISTS ${this.migrationTableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      )
    `);

    console.log('Migration service initialized');
  }

  async runMigrations() {
    try {
      await this.initialize();
      
      // Get list of migration files
      const migrationFiles = this.getMigrationFiles();
      console.log(`Found ${migrationFiles.length} migration files`);

      // Get already executed migrations
      const executedMigrations = await databaseService.all(
        `SELECT filename FROM ${this.migrationTableName} ORDER BY filename`
      );
      
      const executedSet = new Set(executedMigrations.map(m => m.filename));

      // Run pending migrations
      for (const filename of migrationFiles) {
        if (!executedSet.has(filename)) {
          await this.runMigration(filename);
        } else {
          console.log(`Migration ${filename} already executed, skipping`);
        }
      }

      console.log('All migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  getMigrationFiles() {
    try {
      const files = fs.readdirSync(this.migrationsDir);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure proper order
    } catch (error) {
      console.error('Error reading migrations directory:', error);
      return [];
    }
  }

  async runMigration(filename) {
    const filePath = path.join(this.migrationsDir, filename);
    
    try {
      console.log(`Running migration: ${filename}`);
      
      const migrationSQL = fs.readFileSync(filePath, 'utf8');
      const checksum = this.generateChecksum(migrationSQL);

      // Split by semicolon and execute each statement
      const statements = this.parseSQL(migrationSQL);
      
      // Execute migration in a transaction
      await databaseService.transaction(async () => {
        for (const statement of statements) {
          if (statement.trim()) {
            await databaseService.run(statement);
          }
        }

        // Record successful migration
        await databaseService.run(
          `INSERT INTO ${this.migrationTableName} (filename, checksum) VALUES (?, ?)`,
          [filename, checksum]
        );
      });

      console.log(`Migration ${filename} completed successfully`);
    } catch (error) {
      console.error(`Migration ${filename} failed:`, error);
      throw error;
    }
  }

  parseSQL(sql) {
    // Basic SQL statement parser
    // Split by semicolon but be careful about statements within quotes or comments
    const statements = [];
    let current = '';
    let inQuotes = false;
    let inComment = false;
    let quoteChar = null;

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];

      // Handle comments
      if (!inQuotes && char === '-' && nextChar === '-') {
        inComment = true;
        current += char;
        continue;
      }

      if (inComment && char === '\n') {
        inComment = false;
        current += char;
        continue;
      }

      if (inComment) {
        current += char;
        continue;
      }

      // Handle quotes
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        current += char;
        continue;
      }

      if (inQuotes && char === quoteChar) {
        // Check if it's an escaped quote
        if (sql[i + 1] === quoteChar) {
          current += char + nextChar;
          i++; // Skip next character
          continue;
        }
        inQuotes = false;
        quoteChar = null;
        current += char;
        continue;
      }

      // Handle statement separation
      if (!inQuotes && char === ';') {
        if (current.trim()) {
          statements.push(current.trim());
        }
        current = '';
        continue;
      }

      current += char;
    }

    // Add final statement if there's remaining content
    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements.filter(stmt => 
      stmt.trim().length > 0 && 
      !stmt.trim().startsWith('--') // Filter out comment-only statements
    );
  }

  generateChecksum(content) {
    // Simple checksum for migration content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  async rollbackMigration(filename) {
    // Simple rollback - remove from migration table
    // Note: Actual rollback would require rollback scripts
    try {
      await databaseService.run(
        `DELETE FROM ${this.migrationTableName} WHERE filename = ?`,
        [filename]
      );
      
      console.log(`Rollback recorded for migration: ${filename}`);
      console.warn('Note: This only removes the migration record. Actual schema rollback requires manual intervention.');
    } catch (error) {
      console.error(`Rollback failed for migration ${filename}:`, error);
      throw error;
    }
  }

  async getExecutedMigrations() {
    try {
      return await databaseService.all(
        `SELECT * FROM ${this.migrationTableName} ORDER BY executed_at`
      );
    } catch (error) {
      console.error('Error fetching executed migrations:', error);
      return [];
    }
  }

  async getPendingMigrations() {
    const allMigrations = this.getMigrationFiles();
    const executed = await this.getExecutedMigrations();
    const executedSet = new Set(executed.map(m => m.filename));

    return allMigrations.filter(filename => !executedSet.has(filename));
  }

  async getMigrationStatus() {
    const all = this.getMigrationFiles();
    const executed = await this.getExecutedMigrations();
    const pending = await this.getPendingMigrations();

    return {
      total: all.length,
      executed: executed.length,
      pending: pending.length,
      executedMigrations: executed,
      pendingMigrations: pending
    };
  }
}

// Export singleton instance
const migrationService = new MigrationService();
module.exports = migrationService;
