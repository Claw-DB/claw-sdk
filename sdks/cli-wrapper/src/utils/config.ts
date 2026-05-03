import Conf from 'conf';

interface CliConfig {
  apiKey?: string;
  endpoint?: string;
  agentId?: string;
  workspace?: string;
}

const store = new Conf<CliConfig>({ projectName: 'clawdb' });

export function getConfig(): CliConfig {
  return store.store;
}

export function setConfig(key: keyof CliConfig, value: string): void {
  store.set(key, value);
}

export function clearConfig(): void {
  store.clear();
}

export function getApiKey(): string | undefined {
  return process.env['CLAWDB_API_KEY'] ?? store.get('apiKey');
}

export function getEndpoint(): string {
  return process.env['CLAWDB_ENDPOINT'] ?? store.get('endpoint') ?? 'http://localhost:50050';
}
