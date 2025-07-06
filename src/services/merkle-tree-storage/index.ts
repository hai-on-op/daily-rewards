/**
 * Service for storing merkle trees as backup files
 */

import * as fs from 'fs';
import * as path from 'path';

export interface MerkleTree {
  root: string;
  dump: () => any;
}

export interface MerkleTreesData {
  [token: string]: MerkleTree;
}

export interface TreeData {
  token: string;
  entryCounter: number;
  date: string;
  root: string;
  tree: any;
}

export interface SaveMerkleTreesOptions {
  merkleTries: MerkleTreesData;
  entryCounter: number;
  backupDir?: string;
}

/**
 * Saves merkle trees as backup files with timestamped filenames
 * @param options - Configuration options for saving merkle trees
 * @returns Promise that resolves when all trees are saved
 */
export async function saveMerkleTreesAsFiles(
  options: SaveMerkleTreesOptions
): Promise<void> {
  const { merkleTries, entryCounter, backupDir = 'merkle-backups' } = options;

  const currentDate = new Date();
  const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  const timestamp = currentDate.toISOString().replace(/[:.]/g, '-'); // Full timestamp for uniqueness

  // Create backup directory if it doesn't exist
  const fullBackupDir = path.join(process.cwd(), backupDir);
  if (!fs.existsSync(fullBackupDir)) {
    fs.mkdirSync(fullBackupDir, { recursive: true });
  }

  console.log(
    `Saving merkle trees as backup files for entry ${entryCounter}...`
  );

  const savePromises = Object.entries(merkleTries).map(async ([token, tree]) => {
    try {
      const filename = `merkle-tree-${token}-entry${entryCounter}-${dateString}-${timestamp}.json`;
      const filepath = path.join(fullBackupDir, filename);

      const treeData: TreeData = {
        token,
        entryCounter,
        date: currentDate.toISOString(),
        root: tree.root,
        tree: tree.dump(),
      };

      await fs.promises.writeFile(filepath, JSON.stringify(treeData, null, 2));
      console.log(`Merkle tree for ${token} saved to: ${filename}`);

      return { token, filename, success: true };
    } catch (error) {
      console.error(`Error saving merkle tree for ${token}:`, error);
      return { token, error, success: false };
    }
  });

  const results = await Promise.all(savePromises);
  const successfulSaves = results.filter(result => result.success);
  const failedSaves = results.filter(result => !result.success);

  console.log(`Successfully saved ${successfulSaves.length} merkle trees`);
  if (failedSaves.length > 0) {
    console.warn(`Failed to save ${failedSaves.length} merkle trees`);
  }
}

/**
 * Gets the backup directory path
 * @param backupDir - Optional custom backup directory name
 * @returns Full path to the backup directory
 */
export function getBackupDirectory(backupDir: string = 'merkle-backups'): string {
  return path.join(process.cwd(), backupDir);
}

/**
 * Lists all merkle tree backup files
 * @param backupDir - Optional custom backup directory name
 * @returns Array of backup filenames
 */
export function listBackupFiles(backupDir: string = 'merkle-backups'): string[] {
  const fullBackupDir = getBackupDirectory(backupDir);

  if (!fs.existsSync(fullBackupDir)) {
    return [];
  }

  try {
    return fs.readdirSync(fullBackupDir)
      .filter(filename => filename.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first
  } catch (error) {
    console.error('Error listing backup files:', error);
    return [];
  }
}

/**
 * Reads a specific merkle tree backup file
 * @param filename - Name of the backup file to read
 * @param backupDir - Optional custom backup directory name
 * @returns Parsed tree data or null if file doesn't exist
 */
export function readBackupFile(
  filename: string,
  backupDir: string = 'merkle-backups'
): TreeData | null {
  const fullBackupDir = getBackupDirectory(backupDir);
  const filepath = path.join(fullBackupDir, filename);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(fileContent) as TreeData;
  } catch (error) {
    console.error(`Error reading backup file ${filename}:`, error);
    return null;
  }
}