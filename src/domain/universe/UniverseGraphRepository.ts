import { UniverseGraph, UniverseGraphInput, buildUniverseGraph } from './UniverseGraph';

export interface CanonicalUniverseGraphSource {
  load(): UniverseGraphInput;
}

export class UniverseGraphRepository {
  private readonly graph: UniverseGraph;

  constructor(source: CanonicalUniverseGraphSource) {
    this.graph = buildUniverseGraph(source.load());
  }

  getGraph(): UniverseGraph {
    return this.graph;
  }
}
