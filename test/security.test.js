const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isSensitivePath,
  classifyBashCommand,
  detectSecretsInCommand,
  assessMcpRisk,
  detectAnomalies
} = require('../src/analysis/security.js');

// ========== isSensitivePath ==========
describe('isSensitivePath', () => {
  it('flags .env files', () => {
    assert.equal(isSensitivePath('/project/.env'), true);
    assert.equal(isSensitivePath('/project/.env.local'), true);
    assert.equal(isSensitivePath('/project/.env.production'), true);
  });

  it('flags .ssh directory', () => {
    assert.equal(isSensitivePath('/Users/me/.ssh/id_rsa'), true);
    assert.equal(isSensitivePath('/home/user/.ssh/config'), true);
  });

  it('flags .aws directory', () => {
    assert.equal(isSensitivePath('/Users/me/.aws/credentials'), true);
    assert.equal(isSensitivePath('/home/user/.aws/config'), true);
  });

  it('flags .gnupg directory', () => {
    assert.equal(isSensitivePath('/Users/me/.gnupg/pubring.kbx'), true);
  });

  it('flags credential files', () => {
    assert.equal(isSensitivePath('/project/credentials.json'), true);
    assert.equal(isSensitivePath('/project/db-credential.yaml'), true);
  });

  it('flags secret files', () => {
    assert.equal(isSensitivePath('/project/secret.txt'), true);
    assert.equal(isSensitivePath('/project/app-secrets.json'), true);
  });

  it('flags password files', () => {
    assert.equal(isSensitivePath('/project/passwords.txt'), true);
  });

  it('flags .pem and .key files', () => {
    assert.equal(isSensitivePath('/project/cert.pem'), true);
    assert.equal(isSensitivePath('/project/server.key'), true);
  });

  it('flags /etc/ paths', () => {
    assert.equal(isSensitivePath('/etc/passwd'), true);
    assert.equal(isSensitivePath('/etc/nginx/nginx.conf'), true);
  });

  it('flags /var/ paths', () => {
    assert.equal(isSensitivePath('/var/log/syslog'), true);
  });

  it('does not flag normal project files', () => {
    assert.equal(isSensitivePath('/project/src/index.js'), false);
    assert.equal(isSensitivePath('/project/README.md'), false);
    assert.equal(isSensitivePath('/project/package.json'), false);
  });

  it('does not flag null/undefined', () => {
    assert.equal(isSensitivePath(null), false);
    assert.equal(isSensitivePath(undefined), false);
    assert.equal(isSensitivePath(''), false);
  });
});

// ========== classifyBashCommand ==========
describe('classifyBashCommand', () => {
  describe('sudo commands', () => {
    it('classifies sudo rm as sudo', () => {
      assert.equal(classifyBashCommand('sudo rm -rf /tmp/dir'), 'sudo');
    });

    it('classifies sudo apt-get as sudo', () => {
      assert.equal(classifyBashCommand('sudo apt-get install vim'), 'sudo');
    });

    it('classifies sudo chmod as sudo', () => {
      assert.equal(classifyBashCommand('sudo chmod 755 /etc/conf'), 'sudo');
    });
  });

  describe('destructive commands', () => {
    it('classifies rm as destructive', () => {
      assert.equal(classifyBashCommand('rm -rf dist'), 'destructive');
      assert.equal(classifyBashCommand('rm file.txt'), 'destructive');
    });

    it('classifies rmdir as destructive', () => {
      assert.equal(classifyBashCommand('rmdir old-dir'), 'destructive');
    });

    it('classifies git reset --hard as destructive', () => {
      assert.equal(classifyBashCommand('git reset --hard HEAD~1'), 'destructive');
    });

    it('classifies git clean as destructive', () => {
      assert.equal(classifyBashCommand('git clean -fd'), 'destructive');
    });

    it('classifies git checkout . as destructive', () => {
      assert.equal(classifyBashCommand('git checkout .'), 'destructive');
    });
  });

  describe('permission commands', () => {
    it('classifies chmod', () => {
      assert.equal(classifyBashCommand('chmod 755 script.sh'), 'permissions');
    });

    it('classifies chown', () => {
      assert.equal(classifyBashCommand('chown user:group file'), 'permissions');
    });

    it('classifies chgrp', () => {
      assert.equal(classifyBashCommand('chgrp staff file'), 'permissions');
    });
  });

  describe('network commands', () => {
    it('classifies curl', () => {
      assert.equal(classifyBashCommand('curl https://api.example.com'), 'network');
    });

    it('classifies wget', () => {
      assert.equal(classifyBashCommand('wget https://example.com/file.tar.gz'), 'network');
    });

    it('classifies git push', () => {
      assert.equal(classifyBashCommand('git push origin main'), 'network');
    });

    it('classifies git clone', () => {
      assert.equal(classifyBashCommand('git clone https://github.com/repo.git'), 'network');
    });

    it('classifies git fetch', () => {
      assert.equal(classifyBashCommand('git fetch origin'), 'network');
    });

    it('classifies git pull', () => {
      assert.equal(classifyBashCommand('git pull origin main'), 'network');
    });

    it('classifies ssh', () => {
      assert.equal(classifyBashCommand('ssh user@host'), 'network');
    });

    it('classifies scp', () => {
      assert.equal(classifyBashCommand('scp file.txt user@host:/path'), 'network');
    });
  });

  describe('package manager commands', () => {
    it('classifies npm install', () => {
      assert.equal(classifyBashCommand('npm install lodash'), 'packageManagers');
    });

    it('classifies yarn add', () => {
      assert.equal(classifyBashCommand('yarn add react'), 'packageManagers');
    });

    it('classifies pip install', () => {
      assert.equal(classifyBashCommand('pip install requests'), 'packageManagers');
    });

    it('classifies cargo install', () => {
      assert.equal(classifyBashCommand('cargo install ripgrep'), 'packageManagers');
    });

    it('classifies brew install', () => {
      assert.equal(classifyBashCommand('brew install node'), 'packageManagers');
    });
  });

  describe('safe commands', () => {
    it('classifies ls as safe', () => {
      assert.equal(classifyBashCommand('ls -la'), 'safe');
    });

    it('classifies git status as safe', () => {
      assert.equal(classifyBashCommand('git status'), 'safe');
    });

    it('classifies git log as safe', () => {
      assert.equal(classifyBashCommand('git log --oneline'), 'safe');
    });

    it('classifies npm test as safe', () => {
      assert.equal(classifyBashCommand('npm test'), 'safe');
    });

    it('classifies cat as safe', () => {
      assert.equal(classifyBashCommand('cat file.txt'), 'safe');
    });

    it('classifies node as safe', () => {
      assert.equal(classifyBashCommand('node script.js'), 'safe');
    });
  });

  it('handles null/empty input', () => {
    assert.equal(classifyBashCommand(null), 'safe');
    assert.equal(classifyBashCommand(''), 'safe');
    assert.equal(classifyBashCommand(undefined), 'safe');
  });
});

// ========== detectSecretsInCommand ==========
describe('detectSecretsInCommand', () => {
  it('detects Bearer tokens', () => {
    const result = detectSecretsInCommand('curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc"');
    assert.ok(result.includes('Bearer Token'));
  });

  it('detects sk- keys (OpenAI/Anthropic)', () => {
    const result = detectSecretsInCommand('curl -H "x-api-key: sk-ant-abc123456789012345678901"');
    assert.ok(result.includes('OpenAI/Anthropic Key (sk-)'));
  });

  it('detects AWS access keys (AKIA)', () => {
    const result = detectSecretsInCommand('export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
    assert.ok(result.includes('AWS Access Key (AKIA)'));
  });

  it('detects GitHub tokens (ghp_)', () => {
    const result = detectSecretsInCommand('git clone https://ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij@github.com/repo');
    assert.ok(result.includes('GitHub Token (ghp_)'));
  });

  it('detects token= parameters', () => {
    const result = detectSecretsInCommand('curl https://api.example.com?token=abc123def456');
    assert.ok(result.includes('token= parameter'));
  });

  it('detects password= parameters', () => {
    const result = detectSecretsInCommand('curl https://api.example.com?password=mysecretpass');
    assert.ok(result.includes('password= parameter'));
  });

  it('detects --password flag', () => {
    const result = detectSecretsInCommand('mysql --password=mysecret -u root');
    assert.ok(result.includes('--password flag'));
  });

  it('returns empty for safe commands', () => {
    const result = detectSecretsInCommand('git status');
    assert.deepEqual(result, []);
  });

  it('handles null input', () => {
    const result = detectSecretsInCommand(null);
    assert.deepEqual(result, []);
  });

  it('detects multiple secrets in one command', () => {
    const result = detectSecretsInCommand('curl -H "Authorization: Bearer abc123" https://api.com?token=xyz987654');
    assert.ok(result.length >= 2);
    assert.ok(result.includes('Bearer Token'));
    assert.ok(result.includes('token= parameter'));
  });
});

// ========== assessMcpRisk ==========
describe('assessMcpRisk', () => {
  it('flags sensitive env var names', () => {
    const result = assessMcpRisk('test-server', {
      command: 'npx',
      args: ['server'],
      env: { GITHUB_TOKEN: 'ghp_abc123' }
    });
    assert.equal(result.exposedSecrets.length, 1);
    assert.equal(result.exposedSecrets[0].name, 'GITHUB_TOKEN');
    assert.equal(result.riskLevel, 'medium');
  });

  it('returns low risk with no env vars', () => {
    const result = assessMcpRisk('safe-server', {
      command: 'npx',
      args: ['server'],
      env: {}
    });
    assert.equal(result.riskLevel, 'low');
    assert.equal(result.exposedSecrets.length, 0);
  });

  it('returns high risk with many secrets', () => {
    const result = assessMcpRisk('risky-server', {
      command: 'npx',
      args: ['server'],
      env: {
        API_KEY: 'key123',
        API_SECRET: 'secret456',
        DB_PASSWORD: 'pass789'
      }
    });
    assert.equal(result.riskLevel, 'high');
    assert.equal(result.exposedSecrets.length, 3);
  });

  it('flags unknown commands as high risk', () => {
    const result = assessMcpRisk('custom-server', {
      command: '/usr/local/bin/my-obscure-tool',
      args: [],
      env: {}
    });
    assert.equal(result.unknownCommand, true);
    assert.equal(result.riskLevel, 'high');
  });

  it('does not flag known commands', () => {
    const result = assessMcpRisk('node-server', {
      command: 'node',
      args: ['server.js'],
      env: {}
    });
    assert.equal(result.unknownCommand, false);
    assert.equal(result.riskLevel, 'low');
  });

  it('truncates env value preview', () => {
    const result = assessMcpRisk('server', {
      command: 'npx',
      env: { MY_SECRET_KEY: 'abcdefghijklmnop' }
    });
    assert.equal(result.exposedSecrets[0].preview, 'abcd...');
  });
});

// ========== detectAnomalies ==========
describe('detectAnomalies', () => {
  it('flags sessions with above-threshold destructive counts', () => {
    const stats = [
      { sessionId: 's1', projectPath: '/p', date: null, destructiveCount: 1, writeCount: 5 },
      { sessionId: 's2', projectPath: '/p', date: null, destructiveCount: 1, writeCount: 5 },
      { sessionId: 's3', projectPath: '/p', date: null, destructiveCount: 30, writeCount: 5 },
    ];
    const result = detectAnomalies(stats);
    assert.ok(result.length >= 1);
    assert.equal(result[0].sessionId, 's3');
    assert.ok(result[0].flags.some(f => f.includes('destructive')));
  });

  it('flags sessions with above-threshold write counts', () => {
    const stats = [
      { sessionId: 's1', projectPath: '/p', date: null, destructiveCount: 0, writeCount: 3 },
      { sessionId: 's2', projectPath: '/p', date: null, destructiveCount: 0, writeCount: 3 },
      { sessionId: 's3', projectPath: '/p', date: null, destructiveCount: 0, writeCount: 60 },
    ];
    const result = detectAnomalies(stats);
    assert.ok(result.length >= 1);
    assert.equal(result[0].sessionId, 's3');
    assert.ok(result[0].flags.some(f => f.includes('write')));
  });

  it('returns empty for uniform usage', () => {
    const stats = [
      { sessionId: 's1', projectPath: '/p', date: null, destructiveCount: 2, writeCount: 5 },
      { sessionId: 's2', projectPath: '/p', date: null, destructiveCount: 2, writeCount: 5 },
      { sessionId: 's3', projectPath: '/p', date: null, destructiveCount: 2, writeCount: 5 },
    ];
    const result = detectAnomalies(stats);
    assert.equal(result.length, 0);
  });

  it('returns empty for fewer than 3 sessions', () => {
    const stats = [
      { sessionId: 's1', projectPath: '/p', date: null, destructiveCount: 100, writeCount: 100 },
      { sessionId: 's2', projectPath: '/p', date: null, destructiveCount: 1, writeCount: 1 },
    ];
    const result = detectAnomalies(stats);
    assert.equal(result.length, 0);
  });
});
