// Loaded with `node --import` by the CLI and child-process tests: points fetch at the fixture server in FIXTURE_BASE (see api.js).
// FIXTURE_MODE=refuse or hangup fails every request as the capture's proxy did.
import process from 'node:process';
import {installFetch} from './api.js';

const state = installFetch({base: process.env.FIXTURE_BASE});
state.mode = process.env.FIXTURE_MODE ?? 'tunnel';
