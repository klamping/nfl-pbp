import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

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
}

interface ScenarioDefinition {
  description: string;
  steps: Step[];
}

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PYTHON_BIN = process.env.PYTHON_BIN ?? 'python';

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
      runPythonScript(context, '01_fetch_pbp.py', {
        env: { FETCH_MODE: 'historical' },
      }),
  },
  fetchCurrent: {
    name: 'Fetch current season play-by-play data',
    description: 'Downloads the entire current-season dataset.',
    action: (context) =>
      runPythonScript(context, '01_fetch_pbp.py', {
        env: { FETCH_MODE: 'current' },
      }),
  },
  updateCurrentWeek: {
    name: 'Update current season with the latest week',
    description: "Appends the most recent week's plays to the local dataset.",
    action: (context) =>
      runPythonScript(context, '01_fetch_pbp.py', {
        env: { FETCH_MODE: 'update-current' },
      }),
  },
  processStats: {
    name: 'Process stats',
    description: 'Placeholder for downstream feature scripts (02-06).',
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
    description: 'Placeholder for model training.',
    action: async () => {
      console.info('Training model placeholder - implement training script.');
    },
  },
  validateModel: {
    name: 'Validate predictive model',
    description: 'Placeholder for validation/metrics.',
    action: async () => {
      console.info('Validating model placeholder - implement validation script.');
    },
  },
  runModel: {
    name: 'Run inference',
    description: 'Placeholder for in-season inference.',
    action: async () => {
      console.info('Running model placeholder - implement inference script.');
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
  'train:model': {
    description: 'Train and validate the model.',
    steps: [stepCatalog.processStats, stepCatalog.trainModel, stepCatalog.validateModel],
  },
  'inference:run': {
    description: 'Run the trained model for inference.',
    steps: [stepCatalog.runModel],
  },
  'refresh:full': {
    description: 'Full refresh: fetch, process, train, validate.',
    steps: [
      stepCatalog.fetchCurrent,
      stepCatalog.processStats,
      stepCatalog.trainModel,
      stepCatalog.validateModel,
    ],
  },
};

function parseArgs(): { scenario: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let scenario = process.env.PIPELINE_SCENARIO ?? 'fetch:current';
  let dryRun = process.env.PIPELINE_DRY_RUN === '1';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--scenario' || arg === '-s') {
      scenario = args[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--scenario=')) {
      scenario = arg.split('=')[1];
      continue;
    }

    if (arg === '--dry-run' || arg === '-d') {
      dryRun = true;
      continue;
    }
  }

  return { scenario, dryRun };
}

function printAvailableScenarios(): void {
  console.info('Available scenarios:');
  Object.entries(SCENARIOS).forEach(([name, definition]) => {
    console.info(`  • ${name.padEnd(22)} ${definition.description}`);
  });
}

async function main(): Promise<void> {
  const { scenario, dryRun } = parseArgs();
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
    envOverrides: {},
  };

  await runPipeline(context, scenarioDefinition.steps);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
