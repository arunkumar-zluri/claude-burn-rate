const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isSensitivePath, classifyBashCommand } = require('../src/analysis/security.js');

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
