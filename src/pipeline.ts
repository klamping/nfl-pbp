import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type StepAction = (context: PipelineContext) => Promise<void> | void;

interface Step {
  name: string;
  description?: string;
  action: StepAction;
}

interface PipelineContext {
  scenario: string;
  dryRun: boolean;
  projectRoot: string;
  pythonBin: string;
  envOverrides: NodeJS.ProcessEnv;
  forceFetch: boolean;
  week?: number;
}

interface ScenarioDefinition {
  description: string;
  steps: Step[];
  envOverrides?: NodeJS.ProcessEnv;
}

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

function resolveStatsScope(
  context: PipelineContext,
): {
  includeHistorical: boolean;
  includeCurrent: boolean;
} {
  const scope = (context.envOverrides.STATS_SCOPE ?? process.env.STATS_SCOPE ?? '').toLowerCase();
  if (scope === 'historical') {
    return { includeHistorical: true, includeCurrent: false };
  }
  if (scope === 'current') {
    return { includeHistorical: false, includeCurrent: true };
  }
  return { includeHistorical: true, includeCurrent: true };
}

async function runPipeline(context: PipelineContext, steps: Step[]): Promise<void> {
  console.info(`Starting pipeline scenario: ${context.scenario}`);
  if (context.dryRun) {
    console.info('Dry-run enabled. Steps will be logged but not executed.');
  }

  for (const step of steps) {
    console.info(`→ Step: ${step.name}`);
    if (step.description) {
      console.info(`   ${step.description}`);
    }

    if (context.dryRun) {
      console.info('   Skipped (dry-run)');
      continue;
    }

    await Promise.resolve(step.action(context));
    console.info('   Completed');
  }

  console.info(`Pipeline scenario "${context.scenario}" finished.`);
}

function runPythonScript(
  context: PipelineContext,
  script: string,
  options?: {
    args?: string[];
    env?: NodeJS.ProcessEnv;
  },
): Promise<void> {
  const scriptPath = path.join(context.projectRoot, script);
  const args = [scriptPath, ...(options?.args ?? [])];
  const mergedEnv = {
    ...process.env,
    ...context.envOverrides,
    ...(options?.env ?? {}),
  };

  console.info(`   Running: ${context.pythonBin} ${[script, ...(options?.args ?? [])].join(' ')}`);

  return new Promise((resolve, reject) => {
    const child = spawn(context.pythonBin, args, {
      cwd: context.projectRoot,
      env: mergedEnv,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} exited with code ${code}`));
      }
    });
  });
}

const stepCatalog: Record<string, Step> = {
  fetchHistorical: {
    name: 'Fetch historical play-by-play data',
    description: 'Downloads the full historical dataset via nflreadpy.',
    action: (context) =>
      runPythonScript(context, 'src/steps/01_fetch_pbp.py', {
        env: { FETCH_MODE: 'historical' },
        args: context.forceFetch ? ['--force'] : [],
      }),
  },
  fetchCurrent: {
    name: 'Fetch current season play-by-play data',
    description: 'Downloads the entire current-season dataset.',
    action: (context) =>
      runPythonScript(context, 'src/steps/01_fetch_pbp.py', {
        env: { FETCH_MODE: 'current' },
        args: context.forceFetch ? ['--force'] : [],
      }),
  },
  updateCurrentWeek: {
    name: 'Update current season with the latest week',
    description: "Appends the most recent week's plays to the local dataset.",
    action: (context) =>
      runPythonScript(context, 'src/steps/01_fetch_pbp.py', {
        env: { FETCH_MODE: 'update-current' },
        args: context.forceFetch ? ['--force'] : [],
      }),
  },
  buildGameStats: {
    name: 'Build game stats',
    description: 'Derive per-game team statistics from PBP using configured calculators.',
    action: async (context) => {
      const module = await import('./steps/02_derive_stats');
      const scope = resolveStatsScope(context);
      if (typeof module.computeTeamStats === 'function') {
        await module.computeTeamStats(scope);
      } else {
        console.warn('No computeTeamStats export found in 02_derive_stats');
      }
    },
  },
  processStats: {
    name: 'Process stats',
    description: 'Placeholder for downstream feature scripts (post-PBP).',
    action: async () => {
      console.info('Processing stats placeholder - implement downstream scripts.');
    },
  },
  analyzeStats: {
    name: 'Analyze stats',
    description: 'Placeholder for analytics/EDA step.',
    action: async () => {
      console.info('Analyzing stats placeholder - implement analytics script.');
    },
  },
  trainModel: {
    name: 'Train predictive model',
    description: 'Fit the regression model on static sample data.',
    action: (context) => runPythonScript(context, 'src/steps/05_train_margin_model.py'),
  },
  runModel: {
    name: 'Run inference',
    description: 'Generate predictions from the trained model.',
    action: (context) => runPythonScript(context, 'src/steps/06_run_margin_model.py'),
  },
  runModelForWeek: {
    name: 'Run inference for a specific week',
    description: 'Generate predictions from the trained model for a single week.',
    action: (context) => {
      if (context.week === undefined || Number.isNaN(context.week)) {
        throw new Error('Week number is required for runModelForWeek.');
      }
      const args = ['--week', String(context.week)];
      return runPythonScript(context, 'src/steps/06_run_margin_model.py', { args });
    },
  },
  generateResults: {
    name: 'Generate current season data to measure against',
    description: 'Results from the current season',
    action: async () => {
      const module = await import('./steps/07_generate_results');
      await module.generateResults();
    },
  },
  collateData: {
    name: 'Collate derived data with game meta',
    description: 'Combine derived stats and game meta into CSVs.',
    action: async (context) => {
      const module = await import('./steps/04_collate_data');
      const scope = resolveStatsScope(context);
      await module.collateData(scope);
    },
  },
  buildTrends: {
    name: 'Build trends',
    description: 'Copy derived stats into team history snapshots.',
    action: async (context) => {
      const module = await import('./steps/03_build_trends');
      const scope = resolveStatsScope(context);
      await module.buildTrends(scope);
    },
  },
  renderMetricsHistory: {
    name: 'Render metrics history',
    description: 'Pretty-print the recorded metrics history.',
    action: async () => {
      const module = await import('./steps/09_render_metrics_history');
      await module.renderMetricsHistory();
    },
  },
  validateModel: {
    name: 'Validate predictive model',
    description: 'Compute simple metrics for the model.',
    action: async () => {
      const module = await import('./steps/08_evaluate_margin_model');
      await module.evaluateDummyModel();
    },
  },
};

const SCENARIOS: Record<string, ScenarioDefinition> = {
  'fetch:historical': {
    description: 'Fetch the full historical dataset.',
    steps: [stepCatalog.fetchHistorical],
  },
  'fetch:current': {
    description: 'Fetch the entire current season (default).',
    steps: [stepCatalog.fetchCurrent],
  },
  'fetch:update-current-week': {
    description: "Append the most recent week's games.",
    steps: [stepCatalog.updateCurrentWeek],
  },
  'process:stats': {
    description: 'Run downstream stat processing scripts.',
    steps: [stepCatalog.processStats],
  },
  'build:game-stats': {
    description: 'Build per-game meta stats from PBP files.',
    steps: [stepCatalog.buildGameStats],
  },
  'collate:data': {
    description: 'Collate derived stats and game meta into CSV outputs.',
    steps: [stepCatalog.collateData],
  },
  'build:trends': {
    description: 'Copy derived stats into team history snapshots.',
    steps: [stepCatalog.buildTrends],
  },
  'build:current-stats': {
    description: 'Run steps needed to process gathered data and create CSV for prediction',
    steps: [
      stepCatalog.processStats,
      stepCatalog.buildGameStats,
      stepCatalog.buildTrends,
      stepCatalog.collateData,
    ],
    envOverrides: { STATS_SCOPE: 'current' },
  },
  'build:historical-stats': {
    description: 'Run steps needed to process historical data and create CSV for training',
    steps: [
      stepCatalog.processStats,
      stepCatalog.buildGameStats,
      stepCatalog.buildTrends,
      stepCatalog.collateData,
    ],
    envOverrides: { STATS_SCOPE: 'historical' },
  },
  'train:model': {
    description: 'Train and validate the margin regression model.',
    steps: [
      stepCatalog.trainModel,
      stepCatalog.runModel,
      stepCatalog.validateModel,
      stepCatalog.renderMetricsHistory,
    ],
  },
  'train:model-full': {
    description: 'Process steps and then train/validate the margin regression model.',
    steps: [
      stepCatalog.processStats,
      stepCatalog.buildGameStats,
      stepCatalog.buildTrends,
      stepCatalog.collateData,
      stepCatalog.trainModel,
      stepCatalog.runModel,
      stepCatalog.generateResults,
      stepCatalog.validateModel,
      stepCatalog.renderMetricsHistory
    ],
  },
  'inference:run': {
    description: 'Run the trained model for inference.',
    steps: [stepCatalog.runModel],
  },
  'report:metrics-history': {
    description: 'Render the metrics history table and summary.',
    steps: [stepCatalog.renderMetricsHistory],
  },
  'run:week-predictions': {
    description: 'Run inference for a specific week number (requires --week).',
    steps: [stepCatalog.runModelForWeek],
  },
  'refresh:full': {
    description: 'Full refresh: fetch, process, train, validate.',
    steps: [
      stepCatalog.fetchCurrent,
      stepCatalog.processStats,
      stepCatalog.buildGameStats,
      stepCatalog.buildTrends,
      stepCatalog.collateData,
      stepCatalog.trainModel,
      stepCatalog.runModel,
      stepCatalog.generateResults,
      stepCatalog.validateModel,
      stepCatalog.renderMetricsHistory,
    ],
  },
};

function printAvailableScenarios(): void {
  console.info('Available scenarios:');
  Object.entries(SCENARIOS).forEach(([name, definition]) => {
    console.info(`  • ${name.padEnd(22)} ${definition.description}`);
  });
}

async function main(): Promise<void> {
  const parsed = yargs(hideBin(process.argv))
    .option('scenario', {
      alias: 's',
      type: 'string',
      describe: 'Pipeline scenario to run',
      default: process.env.PIPELINE_SCENARIO ?? 'fetch:current',
    })
    .option('dry-run', {
      alias: 'd',
      type: 'boolean',
      describe: 'Log steps without executing',
      default: process.env.PIPELINE_DRY_RUN === '1',
    })
    .option('force-fetch', {
      alias: 'f',
      type: 'boolean',
      describe: 'Force re-fetch even if data exists',
      default: false,
    })
    .option('week', {
      type: 'number',
      describe: 'Week number (used by run:week-predictions scenario)',
      default: undefined,
    })
    .option('list-scenarios', {
      alias: 'l',
      type: 'boolean',
      describe: 'List available scenarios and exit',
      default: false,
    })
    .help()
    .parseSync();

  const scenario = parsed.scenario;
  const dryRun = Boolean(parsed['dry-run']);
  const forceFetch = Boolean(parsed['force-fetch']);
  const week = Number.isFinite(parsed.week) ? Number(parsed.week) : undefined;
  if (parsed['list-scenarios']) {
    printAvailableScenarios();
    return;
  }
  const scenarioDefinition = SCENARIOS[scenario];

  if (!scenarioDefinition) {
    console.error(`Unknown scenario "${scenario}".`);
    printAvailableScenarios();
    process.exitCode = 1;
    return;
  }

  const context: PipelineContext = {
    scenario,
    dryRun,
    projectRoot: PROJECT_ROOT,
    pythonBin: DEFAULT_PYTHON_BIN,
    envOverrides: { ...(scenarioDefinition?.envOverrides ?? {}) },
    forceFetch,
    week,
  };

  await runPipeline(context, scenarioDefinition.steps);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
