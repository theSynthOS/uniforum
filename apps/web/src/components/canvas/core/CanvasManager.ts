import { Agent, InteractionEvent } from './types';
import { drawAgent } from '../renderers/drawAgent';
import { drawGrid } from '../renderers/drawGrid';
import { Camera } from './Camera';
import { AssetLoader } from '../assets/AssetLoader';

export class CanvasManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationFrameId: number | null = null;
  
  // State
  private agents: Agent[] = [];
  
  // Systems
  public camera: Camera;
  private assets: AssetLoader;
  private onInteraction?: (event: InteractionEvent) => void;
  private onAgentUpdate?: (agents: Agent[]) => void;

  private lastTime: number = 0;
  private totalTime: number = 0; // For animations

  constructor(canvas: HTMLCanvasElement, onInteraction?: (event: InteractionEvent) => void, onAgentUpdate?: (agents: Agent[]) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2d context');
    this.ctx = context;
    this.onInteraction = onInteraction;
    this.onAgentUpdate = onAgentUpdate;
    
    this.camera = new Camera();
    this.assets = new AssetLoader();
    
    // Initial centering (approx)
    this.camera.x = canvas.width / 2;
    this.camera.y = canvas.height / 2;

    this.setupInteractions();
  }



  public setAgents(agents: Agent[]) {
    this.agents = agents;
  }

  public resize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);

    // Recenter camera
    this.camera.x = width / 2;
    this.camera.y = height / 2;
  }

  public start() {
    if (this.animationFrameId !== null) return;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  public stop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public destroy() {
    this.stop();
  }

  private loop = (time: number) => {
    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.totalTime += deltaTime;

    this.update(deltaTime);
    this.draw();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number) {
    // Agent Movement Logic
    this.agents.forEach(agent => {
      // 1. Path Following
      if (agent.path && agent.path.length > 0) {
        const nextNode = agent.path[0];
        const speed = 20.0;
        
        const dx = nextNode.x - agent.position.x;
        const dy = nextNode.y - agent.position.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 1) {
          agent.position.x += (dx / dist) * speed * deltaTime;
          agent.position.y += (dy / dist) * speed * deltaTime;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            agent.direction = dx > 0 ? 'right' : 'left';
          }
          
          agent.status = 'moving';
        } else {
          agent.position.x = nextNode.x;
          agent.position.y = nextNode.y;
          agent.path.shift();
        }
      } else {
        if (agent.status === 'moving') agent.status = 'idle';
      }
      
      if ((!agent.path || agent.path.length === 0) && agent.targetPosition) {
          agent.targetPosition = undefined;
      }
    });

    // 2. Proximity Detection for Chat Bubbles
    const CHAT_DISTANCE = 40; // Pixels
    
    // Forum topic titles - aligned with AGENTS.md terminology
    const FORUM_TOPICS = [
      "Proposal: Enable AntiSandwichHook for MEV protection",
      "Fee tier vote - should we adjust to 0.3% base fee?",
      "DynamicFee hook implementation for volatile periods",
      "LimitOrderHook placement at key price ticks",
      "Consensus: Increase liquidity in ETH-USDC pool",
      "Impermanent loss mitigation with BaseAsyncSwap",
      "Governance: LiquidityPenaltyHook for JIT protection",
      "Strategy debate: Conservative vs aggressive rebalancing",
      "Proposal: Cross-pool liquidity optimization on Unichain",
      "Vote on BaseOverrideFee hook parameters",
    ];
    
    // Chat messages - aligned with agent discussion patterns from AGENTS.md
    const CHAT_MESSAGES = [
      "I suggest DynamicFee hook with 0.3% base fee.",
      "As a conservative LP, I prefer MEV protection first.",
      "Let's enable AsyncSwap for batched execution.",
      "My risk tolerance is low, we need more data.",
      "The AntiSandwichHook will protect our trades.",
      "I propose we vote on this fee adjustment.",
      "Agreed, let's reach consensus on the hook config.",
      "Based on my LP experience, this APY is unsustainable.",
      "We should set a LimitOrder at the 0.05% tick.",
      "The current volatility requires aggressive rebalancing.",
    ];

    let statusChanged = false;
    
    // Track which agents are in proximity groups (Union-Find style)
    const agentGroups = new Map<string, Set<string>>(); // agentId -> set of connected agentIds
    
    // Find all proximity connections
    for (let i = 0; i < this.agents.length; i++) {
      for (let j = i + 1; j < this.agents.length; j++) {
        const a1 = this.agents[i];
        const a2 = this.agents[j];
        
        const dist = Math.hypot(a1.position.x - a2.position.x, a1.position.y - a2.position.y);
        
        if (dist < CHAT_DISTANCE) {
          // Connect these two agents
          if (!agentGroups.has(a1.id)) agentGroups.set(a1.id, new Set([a1.id]));
          if (!agentGroups.has(a2.id)) agentGroups.set(a2.id, new Set([a2.id]));
          
          // Merge groups
          const group1 = agentGroups.get(a1.id)!;
          const group2 = agentGroups.get(a2.id)!;
          const merged = new Set([...group1, ...group2]);
          
          // Update all members to point to merged group
          merged.forEach(id => agentGroups.set(id, merged));
        }
      }
    }

    // Process each unique group
    const processedGroups = new Set<string>();
    
    for (const [agentId, group] of agentGroups) {
      const groupKey = [...group].sort().join('-');
      if (processedGroups.has(groupKey)) continue;
      processedGroups.add(groupKey);
      
      // Get agents in this group
      const groupAgents = this.agents.filter(a => group.has(a.id));
      
      // Mark all as discussing if not already
      groupAgents.forEach(agent => {
        if (agent.status !== 'discussing') {
          agent.status = 'discussing';
          agent.path = [];
          agent.lastMessage = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
          // Store group key for forum separation
          (agent as any).discussionGroup = groupKey;
          statusChanged = true;
        }
      });
    }

    // Notify React of changes
    if (statusChanged && this.onAgentUpdate) {
      this.onAgentUpdate([...this.agents]);
    }
  }

  private draw() {
    const { width, height } = this.canvas;
    
    // 1. Clear - Background Color
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for clear
    this.ctx.fillStyle = '#0f172a'; // Deep slate
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    this.ctx.save();
    
    // 2. Apply Camera
    const dpr = window.devicePixelRatio || 1;
    // Note: ctx.scale(dpr, dpr) was handled in resize, but explicit transforms reset it sometimes
    // Simpler approach: Camera handles all world transforms
    this.camera.transform(this.ctx);

    // 3. Draw Background Map
    const mapBg = this.assets.getImage('map_bg');
    if (mapBg) {
      // Draw centered at 0,0
      const x = -mapBg.width / 2;
      const y = -mapBg.height / 2;
      this.ctx.drawImage(mapBg, x, y);
    } else {
      // Fallback to Grid if map not loaded yet
      drawGrid(this.ctx, { 
        width: width / dpr, 
        height: height / dpr, 
        backgroundColor: '', 
        gridColor: 'rgba(56, 189, 248, 0.1)' 
      }, this.camera.x, this.camera.y, this.camera.scale);
    }

    // 4. Draw Agents
    this.agents.forEach(agent => drawAgent(this.ctx, agent, this.assets, this.totalTime));

    this.ctx.restore();
  }

  private setupInteractions() {
    // Mouse DOWN/MOVE/UP handled in React component? 
    // Or we bind them here. CanvasManager owning interaction is cleaner.
    
    // But Zoom/Pan logic often fits better in React due to specialized hooks, 
    // OR we do standard event listeners here. Let's do listeners here.
  }

  // Exposed for the React component to call on events
  public handleMouseDown(x: number, y: number) {
      // Pan start logic could go here if managed internally
  }

  public handleInteractionRaw(clientX: number, clientY: number, type: 'click' | 'hover') {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      
      const worldPos = this.camera.screenToWorld(screenX, screenY);
      
      this.handleHitTest(worldPos.x, worldPos.y, type);
  }

  private handleHitTest(worldX: number, worldY: number, type: 'click' | 'hover') {
    // Check Agents
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      const dx = worldX - agent.position.x;
      const dy = worldY - agent.position.y;
      if (dx * dx + dy * dy <= 225) { // 15 radius
        this.onInteraction?.({ type, x: worldX, y: worldY, target: { type: 'agent', id: agent.id } });
        this.canvas.style.cursor = 'pointer';
        return;
      }
    }
    
    // Check Rooms...
    this.canvas.style.cursor = 'grab'; // Default pan cursor
  }
}
