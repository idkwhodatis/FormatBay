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