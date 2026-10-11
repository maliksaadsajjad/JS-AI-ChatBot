const Storage = [
    // NVMe SSD
    {id:"nvme-256",name:"256GB NVMe SSD",type:"NVMe SSD",capacityGb:256,tier:"low",price:25,goodFor:["office","school"],notes:"Small boot drive for basic builds"},
    {id:"nvme-500",name:"500GB NVMe SSD",type:"NVMe SSD",capacityGb:500,tier:"low",price:40,goodFor:["gaming","programming","office","school"],notes:"Budget boot and games drive"},
    {id:"nvme-1tb",name:"1TB NVMe SSD",type:"NVMe SSD",capacityGb:1000,tier:"mid",price:65,goodFor:["gaming","programming","editing","office","school","streaming"],notes:"Best all-round boot + games drive"},
    {id:"nvme-2tb",name:"2TB NVMe SSD",type:"NVMe SSD",capacityGb:2000,tier:"high",price:110,goodFor:["gaming","programming","editing","streaming"],notes:"Large fast primary drive"},
    {id:"nvme-2x2tb",name:"2x 2TB NVMe SSD",type:"NVMe SSD",capacityGb:4000,tier:"high",price:220,goodFor:["gaming","programming","editing","streaming"],notes:"Dual 2TB NVMe drives for OS + games/media"},
  
    // SATA SSD
    {id:"sata-500",name:"500GB SATA SSD",type:"SATA SSD",capacityGb:500,tier:"low",price:35,goodFor:["office","school","gaming"],notes:"Affordable solid-state storage"},
    {id:"sata-1tb",name:"1TB SATA SSD",type:"SATA SSD",capacityGb:1000,tier:"mid",price:55,goodFor:["gaming","programming","office","school"],notes:"Reliable secondary SSD"},
    {id:"sata-2tb",name:"2TB SATA SSD",type:"SATA SSD",capacityGb:2000,tier:"mid",price:100,goodFor:["gaming","programming","editing"],notes:"Large SATA solid-state drive"},
  
    // HDD
    {id:"hdd-500",name:"500GB HDD",type:"HDD",capacityGb:500,tier:"low",price:25,goodFor:["office","school"],notes:"Basic bulk storage"},
    {id:"hdd-1tb",name:"1TB HDD",type:"HDD",capacityGb:1000,tier:"low",price:35,goodFor:["office","school"],notes:"Budget bulk storage"},
    {id:"hdd-2tb",name:"2TB HDD",type:"HDD",capacityGb:2000,tier:"mid",price:55,goodFor:["gaming","editing","office"],notes:"Affordable large-capacity storage"},
    {id:"hdd-4tb",name:"4TB HDD",type:"HDD",capacityGb:4000,tier:"mid",price:90,goodFor:["editing","streaming","office"],notes:"Large media and archive drive"},
    {id:"hdd-6tb",name:"6TB HDD",type:"HDD",capacityGb:6000,tier:"high",price:125,goodFor:["editing","streaming"],notes:"High-capacity archive storage"},
    {id:"hdd-8tb",name:"8TB HDD",type:"HDD",capacityGb:8000,tier:"high",price:160,goodFor:["editing","streaming"],notes:"Very large archive and media storage"}
  ];