import rawMarketGroups from '../../data/marketGroups.json';

export interface MarketGroupNode {
  market_group_id: number;
  parent_group_id: number | null;
  name: string;
  description: string;
  types: number[];
  icon?: string;
}

const ROOT_ICONS: Record<number, string> = {
  2: '📜', // Blueprints & Reactions
  4: '🚀', // Ships
  9: '🛡️', // Ship Equipment
  11: '💥', // Ammunition & Charges
  19: '📦', // Trade Goods
  24: '💉', // Implants & Boosters
  150: '🧠', // Skills
  157: '🤖', // Drones
  475: '💎', // Manufacture & Research
  477: '🛰️', // Structures
  955: '🔧', // Ship and Module Modifications
  1320: '🪐', // Planetary Infrastructure
  1396: '👔', // Apparel
  1659: '🎖️', // Special Edition Assets
  1922: '⭐', // Pilot's Services
  1954: '🎨', // Ship SKINs
  2202: '🛠️', // Structure Equipment
  2203: '⚙️', // Structure Modifications
  3628: '✨', // Personalization
};

export class MarketGroupRepository {
  private static instance: MarketGroupRepository;

  private groupMap = new Map<number, MarketGroupNode>();
  private childrenMap = new Map<number, MarketGroupNode[]>();
  private typeToGroupMap = new Map<number, number>();
  private rootGroups: MarketGroupNode[] = [];

  private constructor() {
    const rawMap = rawMarketGroups as Record<string, MarketGroupNode>;
    const allGroups = Object.values(rawMap);

    for (const g of allGroups) {
      const node: MarketGroupNode = {
        ...g,
        icon: ROOT_ICONS[g.market_group_id] || (g.parent_group_id === null ? '📁' : undefined),
      };
      this.groupMap.set(g.market_group_id, node);

      // Map types to group
      if (g.types && Array.isArray(g.types)) {
        for (const tid of g.types) {
          this.typeToGroupMap.set(tid, g.market_group_id);
        }
      }
    }

    // Build hierarchy
    for (const g of this.groupMap.values()) {
      if (g.parent_group_id === null) {
        this.rootGroups.push(g);
      } else {
        const list = this.childrenMap.get(g.parent_group_id) || [];
        list.push(g);
        this.childrenMap.set(g.parent_group_id, list);
      }
    }

    // Sort roots & children alphabetically
    this.rootGroups.sort((a, b) => a.name.localeCompare(b.name));
    for (const list of this.childrenMap.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  static getInstance(): MarketGroupRepository {
    if (!MarketGroupRepository.instance) {
      MarketGroupRepository.instance = new MarketGroupRepository();
    }
    return MarketGroupRepository.instance;
  }

  getRootGroups(): MarketGroupNode[] {
    return this.rootGroups;
  }

  getGroup(groupId: number): MarketGroupNode | undefined {
    return this.groupMap.get(groupId);
  }

  getChildGroups(parentId: number): MarketGroupNode[] {
    return this.childrenMap.get(parentId) || [];
  }

  hasChildren(groupId: number): boolean {
    const children = this.childrenMap.get(groupId);
    return Boolean(children && children.length > 0);
  }

  getGroupForType(typeId: number): MarketGroupNode | undefined {
    const gid = this.typeToGroupMap.get(typeId);
    return gid ? this.groupMap.get(gid) : undefined;
  }

  /**
   * Returns breadcrumbs array starting from root down to the given market group.
   */
  getBreadcrumbs(groupId: number): MarketGroupNode[] {
    const crumbs: MarketGroupNode[] = [];
    let curr: MarketGroupNode | undefined = this.groupMap.get(groupId);
    while (curr) {
      crumbs.unshift(curr);
      curr = curr.parent_group_id !== null ? this.groupMap.get(curr.parent_group_id) : undefined;
    }
    return crumbs;
  }

  /**
   * Returns breadcrumbs array down to the group containing the given item type.
   */
  getItemBreadcrumbs(typeId: number): MarketGroupNode[] {
    const gid = this.typeToGroupMap.get(typeId);
    return gid ? this.getBreadcrumbs(gid) : [];
  }

  /**
   * Recursively collects all type IDs contained within a group and all its sub-groups.
   */
  getAllTypesForGroup(groupId: number): number[] {
    const result: number[] = [];
    const visited = new Set<number>();

    const traverse = (gid: number) => {
      if (visited.has(gid)) return;
      visited.add(gid);

      const g = this.groupMap.get(gid);
      if (!g) return;

      if (g.types && Array.isArray(g.types)) {
        for (const tid of g.types) {
          result.push(tid);
        }
      }

      const children = this.childrenMap.get(gid) || [];
      for (const child of children) {
        traverse(child.market_group_id);
      }
    };

    traverse(groupId);
    return result;
  }

  /**
   * Search for market groups matching the given query string.
   */
  searchGroups(query: string): MarketGroupNode[] {
    if (!query || !query.trim()) return [];
    const normalized = query.toLowerCase().trim();
    const matches: MarketGroupNode[] = [];

    for (const g of this.groupMap.values()) {
      if (g.name.toLowerCase().includes(normalized)) {
        matches.push(g);
      }
    }
    return matches.slice(0, 30);
  }
}
