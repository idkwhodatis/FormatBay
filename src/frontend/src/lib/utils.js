import {clsx} from "clsx";
import {twMerge} from "tailwind-merge";

export function cn(...inputs){
	return twMerge(clsx(inputs));
}

let nextTaskID=0;
export function getNextTaskID(){
	nextTaskID++;
	return nextTaskID-1;
}

export function truncatePath(path,l=35){
	if(path.length<=l){
		return path;
	}
	const keep=Math.floor((l-3)/2);
	return path.slice(0,keep)+'.....'+path.slice(-keep);
}