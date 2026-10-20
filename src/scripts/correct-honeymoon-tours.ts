import fs from "node:fs";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Tour, Destination, Category } from "../models/index.js";
import { tourUpdate } from "../validations/content.js";
import { CACHE_TAGS, revalidateFrontend } from "../services/revalidate.service.js";
const source = JSON.parse(fs.readFileSync("content/tours-import.json", "utf8"));
const reference = JSON.parse(fs.readFileSync("content/honeymoon-reference.json", "utf8"));
const honeymoonSlugs = reference.tourSlugs.slice(0, 3);
const apply = process.argv.includes("--apply");
try {
 await connectDatabase();
 const tours = await Tour.find({ slug: { $in: honeymoonSlugs } }).lean();
 if(tours.length!==3)throw new Error("Expected exactly three Honeymoon packages");
 const category=await Category.findOne({kind:"tour",slug:"honeymoon-tours"}).lean();
 if(!category)throw new Error("Category missing");
 const destinations=await Destination.find({status:"published"}).select("_id name slug").lean();
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
 const plans=tours.map(tour=>{
  const row=source.tours.find((t:{slug:string;categorySlug:string})=>t.slug===tour.slug&&t.categorySlug==="honeymoon-tours");
  const fields:Record<string,unknown>={title:row.name,durationDays:row.duration.days,durationNights:row.duration.nights,shortDescription:row.shortDescription,description:row.description,highlights:row.highlights,category:category._id.toString()};
  if(row.referenceDestinations.length){
   fields.destinations=destinations.filter(d=>row.referenceDestinations.some((name:string)=>norm(name)===norm(d.name)||norm(name)===norm(d.slug))).map(d=>String(d._id));
  } else {
   fields.destinations=[];fields.itinerary=[];fields.startLocation="";fields.endLocation="";
  }
  return {tour,fields:tourUpdate.parse(fields)};
 });
 console.log(JSON.stringify({apply,plans:plans.map(p=>({slug:p.tour.slug,highlights:p.fields.highlights?.length,itineraryCleared:p.fields.itinerary?.length===0}))}));
 if(apply){
  fs.writeFileSync(`backups/honeymoon-before-data-correction-${Date.now()}.json`,JSON.stringify({category,tours},null,2));
  for(const {tour,fields} of plans){
   const r=await Tour.updateOne({_id:tour._id,updatedAt:tour.updatedAt},{$set:fields},{runValidators:true});
   if(r.matchedCount!==1)throw new Error(`Concurrent edit: ${tour.slug}`);
  }
  revalidateFrontend(CACHE_TAGS.tours,CACHE_TAGS.categories);
  await new Promise(r=>setTimeout(r,6000));
  console.log("Corrected three packages; images and publication status preserved.");
 }
}finally{await disconnectDatabase()}
