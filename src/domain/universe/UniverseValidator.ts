import { CANONICAL_UNIVERSE_MANIFEST } from '../../data/universeManifest';
import { Sha256 } from '../integrity/Sha256';

export interface UniverseValidationResult {
  status: 'READY' | 'PARTIAL' | 'CORRUPTED' | 'UNAVAILABLE';
  isReady: boolean;
  isDegraded: boolean;
  regionsCount: number;
  systemsCount: number;
  stationsCount: number;
  checksum: string;
  errors: string[];
}

interface UniverseDataFormat {
  regions: Record<string,string>;
  systems: Record<string,{name:string;region_id:number;security:number}>;
  stations: Record<string,{name:string;system_id:number;type_id?:number}>;
}

export class UniverseValidator {
  static serializeDeterministic(raw: unknown): string {
    const data=raw as UniverseDataFormat;
    const canonical={
      regions:Object.entries(data.regions||{}).map(([id,name]): [number,string] => [Number(id),String(name)]).sort((a,b)=>a[0]-b[0]),
      systems:Object.entries(data.systems||{}).map(([id,v]): [number,{name:string;region_id:number;security:number}] => [Number(id),{name:String(v.name),region_id:Number(v.region_id),security:Number(v.security)}]).sort((a,b)=>a[0]-b[0]),
      stations:Object.entries(data.stations||{}).map(([id,v]): [number,{name:string;system_id:number;type_id?:number}] => [Number(id),{name:String(v.name),system_id:Number(v.system_id),...(v.type_id===undefined?{}:{type_id:Number(v.type_id)})}]).sort((a,b)=>a[0]-b[0]),
    };
    return JSON.stringify(canonical);
  }

  static computeChecksum(raw: unknown): string {
    return Sha256.hash(this.serializeDeterministic(raw));
  }

  static validate(raw: unknown): UniverseValidationResult {
    const errors:string[]=[];
    if(!raw||typeof raw!=='object') return {status:'UNAVAILABLE',isReady:false,isDegraded:true,regionsCount:0,systemsCount:0,stationsCount:0,checksum:'',errors:['Universe dataset is missing or not an object']};
    const data=raw as UniverseDataFormat;
    const regions=data.regions&&typeof data.regions==='object'?data.regions:{};
    const systems=data.systems&&typeof data.systems==='object'?data.systems:{};
    const stations=data.stations&&typeof data.stations==='object'?data.stations:{};
    for(const [id,name] of Object.entries(regions)){const regionId=Number(id);if(!Number.isInteger(regionId)||regionId<=0||typeof name!=='string'||!name.trim())errors.push(`Invalid region record ${id}`);}
    for(const [id,system] of Object.entries(systems)){
      const systemId=Number(id);if(!Number.isInteger(systemId)||systemId<=0){errors.push(`Invalid system id ${id}`);continue;}
      if(!system||typeof system.name!=='string'||!system.name.trim())errors.push(`System ${id} has invalid name`);
      if(!Number.isInteger(Number(system.region_id))||!regions[String(Number(system.region_id))])errors.push(`System ${id} references unknown region ${system.region_id}`);
      const security=Number(system.security);if(!Number.isFinite(security)||security<-1||security>1)errors.push(`System ${id} has invalid security ${system.security}`);
    }
    for(const [id,station] of Object.entries(stations)){
      const stationId=Number(id);if(!Number.isInteger(stationId)||stationId<=0){errors.push(`Invalid station id ${id}`);continue;}
      if(!station||typeof station.name!=='string'||!station.name.trim())errors.push(`Station ${id} has invalid name`);
      if(!Number.isInteger(Number(station.system_id))||!systems[String(Number(station.system_id))])errors.push(`Station ${id} references unknown system ${station.system_id}`);
      if(station.type_id!==undefined&&(!Number.isInteger(Number(station.type_id))||Number(station.type_id)<=0))errors.push(`Station ${id} has invalid type_id ${station.type_id}`);
    }
    const regionsCount=Object.keys(regions).length, systemsCount=Object.keys(systems).length, stationsCount=Object.keys(stations).length;
    const checksum=this.computeChecksum(raw);
    const partial=regionsCount<CANONICAL_UNIVERSE_MANIFEST.regionsCount||systemsCount<CANONICAL_UNIVERSE_MANIFEST.systemsCount||stationsCount<CANONICAL_UNIVERSE_MANIFEST.stationsCount;
    const overfull=regionsCount>CANONICAL_UNIVERSE_MANIFEST.regionsCount||systemsCount>CANONICAL_UNIVERSE_MANIFEST.systemsCount||stationsCount>CANONICAL_UNIVERSE_MANIFEST.stationsCount;
    if(partial||overfull)return{status:partial?'PARTIAL':'CORRUPTED',isReady:false,isDegraded:true,regionsCount,systemsCount,stationsCount,checksum,errors:errors.length?errors:['Universe cardinality mismatch against canonical manifest']};
    if(errors.length)return{status:'CORRUPTED',isReady:false,isDegraded:true,regionsCount,systemsCount,stationsCount,checksum,errors};
    if(checksum!==CANONICAL_UNIVERSE_MANIFEST.checksum)return{status:'CORRUPTED',isReady:false,isDegraded:true,regionsCount,systemsCount,stationsCount,checksum,errors:[`Universe checksum mismatch: expected ${CANONICAL_UNIVERSE_MANIFEST.checksum}, got ${checksum}`]};
    return{status:'READY',isReady:true,isDegraded:false,regionsCount,systemsCount,stationsCount,checksum,errors:[]};
  }
}
