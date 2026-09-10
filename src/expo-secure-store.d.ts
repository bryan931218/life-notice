declare module 'expo-secure-store' {
  export function setItemAsync(key:string,value:string,options?:unknown):Promise<void>;
  export function getItemAsync(key:string,options?:unknown):Promise<string|null>;
  export function deleteItemAsync(key:string,options?:unknown):Promise<void>;
}
