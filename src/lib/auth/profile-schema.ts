type QueryError={code?:string;message?:string}|null;

// Retry only an explicitly missing mode column. Never retry permission, network,
// account-status or other schema errors with weaker authentication checks.
export async function withProfileModeColumns<T extends {error:QueryError}>(query:(includeModes:boolean)=>PromiseLike<T>):Promise<T>{
 const result=await query(true);
 const error=result.error;
 if(error&&['42703','PGRST204'].includes(error.code??'')&&/\b(admin_account|admin_mode_normal)\b/.test(error.message??''))return query(false);
 return result;
}
