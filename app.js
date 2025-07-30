const express = require('express');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json());

const path = require('path');
const os = require('os');
const fs = require('fs');

// Configurar logging básico
const logger = {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()}: ${msg}`),
    error: (msg) => console.error(`[ERROR] ${new Date().toISOString()}: ${msg}`)
};

// Classe para o scraper
class LiderAviacaoScraper {
    constructor() {
        this.driver = null;
    }

    // async setupDriver(headless = true) {
    //     try {
    //         const chromeOptions = new chrome.Options();

    //         if (headless) {
    //             chromeOptions.addArguments('--headless');
    //         }

    //         chromeOptions.addArguments(
    //             '--no-sandbox',
    //             '--disable-dev-shm-usage',
    //             '--disable-gpu',
    //             '--window-size=1920,1080',
    //             '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    //         );

    //         this.driver = await new Builder()
    //             .forBrowser('chrome')
    //             .setChromeOptions(chromeOptions)
    //             .build();

    //         logger.info('Driver configurado com sucesso');
    //     } catch (error) {
    //         logger.error(`Erro ao configurar driver: ${error.message}`);
    //         throw error;
    //     }
    // }

    // ... dentro da classe LiderAviacaoScraper

    async setupDriver(headless = true) {
        try {
            const chromeOptions = new chrome.Options();

            if (headless) {
                chromeOptions.addArguments('--headless');
            }

            // Criar um diretório temporário único para cada sessão
            const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profile-'));
            chromeOptions.addArguments(
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '--no-first-run', // Adicionado: Evita a tela de primeira execução
                `--user-data-dir=${userDataDir}` // Adicionado: Diretório de dados de usuário único
            );

            this.driver = await new Builder()
                .forBrowser('chrome')
                .setChromeOptions(chromeOptions)
                .build();

            // Armazenar o caminho para o diretório de dados de usuário temporário
            this.userDataDir = userDataDir;

            logger.info('Driver configurado com sucesso');
        } catch (error) {
            logger.error(`Erro ao configurar driver: ${error.message}`);
            throw error;
        }
    }

    async close() {
        if (this.driver) {
            await this.driver.quit();
            this.driver = null;
            // Remover o diretório de dados de usuário temporário após o fechamento
            if (this.userDataDir && fs.existsSync(this.userDataDir)) {
                try {
                    fs.rmSync(this.userDataDir, { recursive: true, force: true });
                    logger.info(`Diretório de dados de usuário temporário removido: ${this.userDataDir}`);
                } catch (err) {
                    logger.error(`Erro ao remover diretório de dados de usuário temporário: ${err.message}`);
                }
            }
        }
    }

    async login(username, password) {
        try {
            logger.info('Acessando página de login...');
            await this.driver.get('https://sol.lideraviacao.com.br/Login?expired=True&returnurl=https%3A%2F%2Fsol.lideraviacao.com.br%2FAcompanhamentoCliente%2FAcompanhamentoCliente');

            // Aguardar e preencher campo de usuário
            const usernameField = await this.driver.wait(
                until.elementLocated(By.name('User')),
                10000
            );
            await usernameField.clear();
            await usernameField.sendKeys(username);

            // Preencher campo de senha
            const passwordField = await this.driver.findElement(By.name('Password'));
            await passwordField.clear();
            await passwordField.sendKeys(password);

            // Clicar no botão de login
            const loginButton = await this.driver.findElement(By.xpath("//button[@type='submit']"));
            await loginButton.click();

            // Aguardar redirecionamento
            await this.driver.sleep(3000);

            // Verificar se o login foi bem-sucedido
            const currentUrl = await this.driver.getCurrentUrl();

            if (!currentUrl.includes('Login')) {
                logger.info('Login realizado com sucesso!');
                return true;
            } else {
                logger.error('Falha no login');
                return false;
            }

        } catch (error) {
            logger.error(`Erro durante o login: ${error.message}`);
            return false;
        }
    }

    async scrapeTableData() {
        try {
            logger.info('Navegando para página da tabela...');
            // await this.driver.get('https://sol.lideraviacao.com.br/AcompanhamentoCliente/AcompanhamentoCliente');

            // Aguardar a tabela carregar
            const table = await this.driver.wait(
                until.elementLocated(By.id('tbGridAcompanhamento')),
                10000
            );

            // Extrair cabeçalhos da tabela
            let headers = [];
            try {
                const headerRow = await table.findElement(By.css('thead tr'));
                const headerCells = await headerRow.findElements(By.tagName('th'));

                for (const cell of headerCells) {
                    const text = await cell.getText();
                    headers.push(text.trim());
                }
            } catch (error) {
                // Se não houver thead, tentar pegar a primeira linha como cabeçalho
                try {
                    const firstRow = await table.findElement(By.tagName('tr'));
                    const headerCells = await firstRow.findElements(By.tagName('td'));

                    for (const cell of headerCells) {
                        const text = await cell.getText();
                        headers.push(text.trim());
                    }
                } catch (innerError) {
                    logger.error('Não foi possível extrair cabeçalhos');
                }
            }

            logger.info(`Cabeçalhos encontrados: ${JSON.stringify(headers)}`);

            // Extrair dados das linhas
            const data = [];
            let tbody;

            try {
                tbody = await table.findElement(By.tagName('tbody'));
            } catch (error) {
                tbody = table;
            }

            const rows = await tbody.findElements(By.tagName('tr'));

            for (const row of rows) {
                const cells = await row.findElements(By.tagName('td'));

                if (cells.length > 0) {
                    const rowData = {};

                    for (let i = 0; i < cells.length; i++) {
                        const cellText = await cells[i].getText();
                        const header = headers[i] || `Coluna_${i + 1}`;
                        rowData[header] = cellText.trim();
                    }

                    data.push(rowData);
                }
            }

            logger.info(`Extraídos ${data.length} registros da tabela`);
            return data;

        } catch (error) {
            logger.error(`Erro ao extrair dados da tabela: ${error.message}`);
            return [];
        }
    }

    async close() {
        if (this.driver) {
            await this.driver.quit();
            this.driver = null;
        }
    }
}

// Validadores
const loginValidation = [
    body('username').notEmpty().withMessage('Username é obrigatório'),
    body('password').notEmpty().withMessage('Password é obrigatório')
];

// Middleware para tratar erros de validação
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dados de entrada inválidos',
            errors: errors.array()
        });
    }
    next();
};

// Rotas
app.get('/', (req, res) => {
    res.json({
        message: 'API de Scraping Líder Aviação',
        status: 'online'
    });
});

app.post('/scrape-data', loginValidation, handleValidationErrors, async (req, res) => {
    let scraper = null;

    try {
        const { username, password } = req.body;

        // Criar nova instância do scraper
        scraper = new LiderAviacaoScraper();
        await scraper.setupDriver(false); // headless = false para debug

        // Fazer login
        const loginSuccess = await scraper.login(username, password);

        if (!loginSuccess) {
            await scraper.close();
            return res.status(401).json({
                success: false,
                message: 'Falha na autenticação'
            });
        }

        // Extrair dados da tabela
        const tableData = await scraper.scrapeTableData();

        // Fechar driver
        await scraper.close();

        if (tableData.length === 0) {
            return res.json({
                success: false,
                message: 'Nenhum dado encontrado na tabela',
                data: []
            });
        }

        res.json({
            success: true,
            message: `Extraídos ${tableData.length} registros com sucesso`,
            data: tableData
        });

    } catch (error) {
        if (scraper) {
            await scraper.close();
        }

        logger.error(`Erro inesperado: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Erro interno: ${error.message}`
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now()
    });
});

app.post('/test-login', loginValidation, handleValidationErrors, async (req, res) => {
    let scraper = null;

    try {
        const { username, password } = req.body;

        scraper = new LiderAviacaoScraper();
        await scraper.setupDriver(true); // headless = true para teste rápido

        const loginSuccess = await scraper.login(username, password);
        await scraper.close();

        if (loginSuccess) {
            res.json({
                success: true,
                message: 'Login realizado com sucesso'
            });
        } else {
            res.json({
                success: false,
                message: 'Falha no login'
            });
        }

    } catch (error) {
        if (scraper) {
            await scraper.close();
        }

        res.json({
            success: false,
            message: `Erro: ${error.message}`
        });
    }
});

// Middleware para tratar rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

// Middleware para tratar erros globais
app.use((error, req, res, next) => {
    logger.error(`Erro global: ${error.message}`);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 API rodando em http://localhost:${PORT}/`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Recebido SIGINT, fechando servidor...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Recebido SIGTERM, fechando servidor...');
    process.exit(0);
});

module.exports = app;