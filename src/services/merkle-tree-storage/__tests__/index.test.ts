/**
 * Unit tests for merkle tree storage service
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  saveMerkleTreesAsFiles,
  getBackupDirectory,
  listBackupFiles,
  readBackupFile
} from '../index';

// Mock fs module
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn()
  }
}));

jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockWriteFile = mockFs.promises.writeFile as jest.MockedFunction<typeof mockFs.promises.writeFile>;

describe('Merkle Tree Storage Service', () => {
  let mockMerkleTries: any;
  let mockBackupDir: string;
  let mockBackupPath: string;
  let defaultBackupPath: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.readFileSync.mockReturnValue('{}');

    // Mock merkle trees
    mockMerkleTries = {
      KITE: {
        root: '0x1234567890123456789012345678901234567890123456789012345678901234',
        dump: jest.fn().mockReturnValue({ leaves: [], tree: [] })
      },
      OP: {
        root: '0x2345678901234567890123456789012345678901234567890123456789012345',
        dump: jest.fn().mockReturnValue({ leaves: [], tree: [] })
      }
    };

    mockBackupDir = 'test-backups';
    mockBackupPath = `${process.cwd()}/${mockBackupDir}`;
    defaultBackupPath = `${process.cwd()}/merkle-backups`;
  });

  describe('saveMerkleTreesAsFiles', () => {
    it('should save merkle trees as files with correct structure', async () => {
      const entryCounter = 5;

      await saveMerkleTreesAsFiles({
        merkleTries: mockMerkleTries,
        entryCounter,
        backupDir: mockBackupDir
      });

      // Verify directory creation
      expect(mockFs.existsSync).toHaveBeenCalledWith(mockBackupPath);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockBackupPath, { recursive: true });

      // Verify files were written
      expect(mockWriteFile).toHaveBeenCalledTimes(2);

      // Check first file call
      const firstCall = mockWriteFile.mock.calls[0];
      expect(firstCall[0]).toContain('merkle-tree-KITE-entry5-');
      expect(firstCall[0]).toContain('.json');

      const firstFileContent = JSON.parse(firstCall[1] as string);
      expect(firstFileContent).toMatchObject({
        token: 'KITE',
        entryCounter: 5,
        root: '0x1234567890123456789012345678901234567890123456789012345678901234',
        tree: { leaves: [], tree: [] }
      });
      expect(firstFileContent.date).toBeDefined();

      // Check second file call
      const secondCall = mockWriteFile.mock.calls[1];
      expect(secondCall[0]).toContain('merkle-tree-OP-entry5-');
      expect(secondCall[0]).toContain('.json');

      const secondFileContent = JSON.parse(secondCall[1] as string);
      expect(secondFileContent).toMatchObject({
        token: 'OP',
        entryCounter: 5,
        root: '0x2345678901234567890123456789012345678901234567890123456789012345',
        tree: { leaves: [], tree: [] }
      });
    });

    it('should handle directory already existing', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await saveMerkleTreesAsFiles({
        merkleTries: mockMerkleTries,
        entryCounter: 1,
        backupDir: mockBackupDir
      });

      expect(mockFs.existsSync).toHaveBeenCalledWith(mockBackupPath);
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle file write errors gracefully', async () => {
      const writeError = new Error('Write failed');
      mockWriteFile.mockRejectedValueOnce(writeError);

      await saveMerkleTreesAsFiles({
        merkleTries: mockMerkleTries,
        entryCounter: 1
      });

      // Should still write the second file
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it('should use default backup directory when not specified', async () => {
      await saveMerkleTreesAsFiles({
        merkleTries: mockMerkleTries,
        entryCounter: 1
      });

      expect(mockFs.existsSync).toHaveBeenCalledWith(defaultBackupPath);
    });

    it('should handle empty merkle tries', async () => {
      await saveMerkleTreesAsFiles({
        merkleTries: {},
        entryCounter: 1
      });

      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('getBackupDirectory', () => {
    it('should return correct backup directory path', () => {
      const result = getBackupDirectory('custom-backups');
      expect(result).toBe(`${process.cwd()}/custom-backups`);
    });

    it('should use default directory when not specified', () => {
      const result = getBackupDirectory();
      expect(result).toBe(defaultBackupPath);
    });
  });

  describe('listBackupFiles', () => {
    it('should return sorted list of backup files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'merkle-tree-KITE-entry1-2023-01-01-12-00-00-000Z.json',
        'merkle-tree-OP-entry1-2023-01-01-12-00-00-000Z.json',
        'merkle-tree-KITE-entry2-2023-01-02-12-00-00-000Z.json'
      ] as any);

      const result = listBackupFiles('test-backups');

      expect(result).toEqual([
        'merkle-tree-KITE-entry2-2023-01-02-12-00-00-000Z.json',
        'merkle-tree-OP-entry1-2023-01-01-12-00-00-000Z.json',
        'merkle-tree-KITE-entry1-2023-01-01-12-00-00-000Z.json'
      ]);
    });

    it('should return empty array when directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = listBackupFiles('test-backups');

      expect(result).toEqual([]);
    });

    it('should filter out non-json files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        'merkle-tree-KITE-entry1-2023-01-01-12-00-00-000Z.json',
        'README.md',
        'merkle-tree-OP-entry1-2023-01-01-12-00-00-000Z.json',
        'config.txt'
      ] as any);

      const result = listBackupFiles('test-backups');

      expect(result).toEqual([
        'merkle-tree-OP-entry1-2023-01-01-12-00-00-000Z.json',
        'merkle-tree-KITE-entry1-2023-01-01-12-00-00-000Z.json'
      ]);
    });

    it('should handle readdir errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = listBackupFiles('test-backups');

      expect(result).toEqual([]);
    });
  });

  describe('readBackupFile', () => {
    it('should read and parse backup file correctly', () => {
      const mockFileContent = JSON.stringify({
        token: 'KITE',
        entryCounter: 1,
        date: '2023-01-01T12:00:00.000Z',
        root: '0x1234567890123456789012345678901234567890123456789012345678901234',
        tree: { leaves: [], tree: [] }
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockFileContent);

      const result = readBackupFile('test-file.json', 'test-backups');

      expect(result).toEqual({
        token: 'KITE',
        entryCounter: 1,
        date: '2023-01-01T12:00:00.000Z',
        root: '0x1234567890123456789012345678901234567890123456789012345678901234',
        tree: { leaves: [], tree: [] }
      });
    });

    it('should return null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = readBackupFile('nonexistent.json', 'test-backups');

      expect(result).toBeNull();
    });

    it('should handle parse errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const result = readBackupFile('invalid.json', 'test-backups');

      expect(result).toBeNull();
    });

    it('should handle read errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = readBackupFile('error.json', 'test-backups');

      expect(result).toBeNull();
    });
  });
});
