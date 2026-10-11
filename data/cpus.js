const CPUs = [
    // AMD AM4 — DDR4
    {id:"r5-3600",name:"Ryzen 5 3600",brand:"AMD",socket:"AM4",cores:6,threads:12,tdp:65,tier:"low",price:85,goodFor:["gaming","programming","office"],hasIgpu:false,notes:"Older but capable AM4 budget CPU"},
    {id:"r5-5600",name:"Ryzen 5 5600",brand:"AMD",socket:"AM4",cores:6,threads:12,tdp:65,tier:"mid",price:120,goodFor:["gaming","programming","streaming"],hasIgpu:false,notes:"Excellent value AM4 gaming CPU"},
    {id:"r5-5600x",name:"Ryzen 5 5600X",brand:"AMD",socket:"AM4",cores:6,threads:12,tdp:65,tier:"mid",price:135,goodFor:["gaming","programming","streaming"],hasIgpu:false,notes:"Fast 6-core AM4 option"},
    {id:"r7-5700x",name:"Ryzen 7 5700X",brand:"AMD",socket:"AM4",cores:8,threads:16,tdp:65,tier:"mid",price:165,goodFor:["gaming","programming","streaming","editing"],hasIgpu:false,notes:"Efficient 8-core AM4 all-rounder"},
    {id:"r7-5700x3d",name:"Ryzen 7 5700X3D",brand:"AMD",socket:"AM4",cores:8,threads:16,tdp:105,tier:"high",price:230,goodFor:["gaming","streaming"],hasIgpu:false,notes:"One of the strongest gaming upgrades for AM4"},
    {id:"r9-5900x",name:"Ryzen 9 5900X",brand:"AMD",socket:"AM4",cores:12,threads:24,tdp:105,tier:"high",price:260,goodFor:["gaming","programming","streaming","editing"],hasIgpu:false,notes:"Strong 12-core AM4 productivity CPU"},
    {id:"r9-5950x",name:"Ryzen 9 5950X",brand:"AMD",socket:"AM4",cores:16,threads:32,tdp:105,tier:"high",price:330,goodFor:["programming","streaming","editing"],hasIgpu:false,notes:"High-core-count AM4 workstation option"},
  
    // AMD AM5 — DDR5
    {id:"r5-7500f",name:"Ryzen 5 7500F",brand:"AMD",socket:"AM5",cores:6,threads:12,tdp:65,tier:"low",price:125,goodFor:["gaming","programming"],hasIgpu:false,notes:"Excellent budget AM5 gaming CPU"},
    {id:"r5-7600",name:"Ryzen 5 7600",brand:"AMD",socket:"AM5",cores:6,threads:12,tdp:65,tier:"mid",price:190,goodFor:["gaming","programming","streaming"],hasIgpu:true,notes:"Strong mainstream AM5 gaming CPU"},
    {id:"r5-7600x",name:"Ryzen 5 7600X",brand:"AMD",socket:"AM5",cores:6,threads:12,tdp:105,tier:"mid",price:205,goodFor:["gaming","programming","streaming"],hasIgpu:true,notes:"Higher-clocked 6-core AM5 CPU"},
    {id:"r7-7700",name:"Ryzen 7 7700",brand:"AMD",socket:"AM5",cores:8,threads:16,tdp:65,tier:"mid",price:240,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Efficient 8-core AM5 CPU"},
    {id:"r7-7700x",name:"Ryzen 7 7700X",brand:"AMD",socket:"AM5",cores:8,threads:16,tdp:105,tier:"mid",price:280,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Fast 8-core AM5 all-rounder"},
    {id:"r7-7800x3d",name:"Ryzen 7 7800X3D",brand:"AMD",socket:"AM5",cores:8,threads:16,tdp:120,tier:"high",price:330,goodFor:["gaming","streaming"],hasIgpu:true,notes:"Excellent gaming-focused X3D CPU"},
    {id:"r9-7900",name:"Ryzen 9 7900",brand:"AMD",socket:"AM5",cores:12,threads:24,tdp:65,tier:"high",price:320,goodFor:["programming","streaming","editing","gaming"],hasIgpu:true,notes:"Efficient 12-core AM5 CPU"},
    {id:"r9-7900x",name:"Ryzen 9 7900X",brand:"AMD",socket:"AM5",cores:12,threads:24,tdp:170,tier:"high",price:350,goodFor:["programming","streaming","editing","gaming"],hasIgpu:true,notes:"High-performance 12-core AM5 CPU"},
    {id:"r9-7950x",name:"Ryzen 9 7950X",brand:"AMD",socket:"AM5",cores:16,threads:32,tdp:170,tier:"high",price:500,goodFor:["programming","streaming","editing"],hasIgpu:true,notes:"16-core AM5 productivity powerhouse"},
    {id:"r7-9700x",name:"Ryzen 7 9700X",brand:"AMD",socket:"AM5",cores:8,threads:16,tdp:65,tier:"high",price:320,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Efficient Zen 5 8-core CPU"},
    {id:"r7-9800x3d",name:"Ryzen 7 9800X3D",brand:"AMD",socket:"AM5",cores:8,threads:16,tdp:120,tier:"high",price:470,goodFor:["gaming","streaming"],hasIgpu:true,notes:"Top-tier gaming-focused X3D CPU"},
    {id:"r9-9900x",name:"Ryzen 9 9900X",brand:"AMD",socket:"AM5",cores:12,threads:24,tdp:120,tier:"high",price:430,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"High-end 12-core Zen 5 CPU"},
    {id:"r9-9950x",name:"Ryzen 9 9950X",brand:"AMD",socket:"AM5",cores:16,threads:32,tdp:170,tier:"high",price:600,goodFor:["programming","streaming","editing"],hasIgpu:true,notes:"16-core Zen 5 productivity flagship"},
    {id:"r9-9950x3d",name:"Ryzen 9 9950X3D",brand:"AMD",socket:"AM5",cores:16,threads:32,tdp:170,tier:"high",price:700,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Extreme gaming and productivity CPU"},
  
    // Intel LGA1700 — compatible with DDR4 or DDR5 depending on motherboard
    {id:"i3-12100f",name:"Core i3-12100F",brand:"Intel",socket:"LGA1700",cores:4,threads:8,tdp:58,tier:"low",price:80,goodFor:["office","school","gaming"],hasIgpu:false,notes:"Very capable entry-level gaming CPU"},
    {id:"i5-12400f",name:"Core i5-12400F",brand:"Intel",socket:"LGA1700",cores:6,threads:12,tdp:65,tier:"low",price:115,goodFor:["gaming","programming","office"],hasIgpu:false,notes:"Excellent budget Intel gaming CPU"},
    {id:"i5-12600k",name:"Core i5-12600K",brand:"Intel",socket:"LGA1700",cores:10,threads:16,tdp:125,tier:"mid",price:180,goodFor:["gaming","programming","streaming"],hasIgpu:true,notes:"Strong hybrid-core mainstream CPU"},
    {id:"i7-12700k",name:"Core i7-12700K",brand:"Intel",socket:"LGA1700",cores:12,threads:20,tdp:125,tier:"high",price:250,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"High-performance Alder Lake CPU"},
    {id:"i9-12900k",name:"Core i9-12900K",brand:"Intel",socket:"LGA1700",cores:16,threads:24,tdp:125,tier:"high",price:330,goodFor:["programming","streaming","editing","gaming"],hasIgpu:true,notes:"High-end 12th-gen Intel CPU"},
    {id:"i5-13400f",name:"Core i5-13400F",brand:"Intel",socket:"LGA1700",cores:10,threads:16,tdp:65,tier:"mid",price:170,goodFor:["gaming","programming","streaming"],hasIgpu:false,notes:"Balanced 13th-gen mainstream CPU"},
    {id:"i5-13600k",name:"Core i5-13600K",brand:"Intel",socket:"LGA1700",cores:14,threads:20,tdp:125,tier:"high",price:250,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Excellent gaming and creator CPU"},
    {id:"i7-13700k",name:"Core i7-13700K",brand:"Intel",socket:"LGA1700",cores:16,threads:24,tdp:125,tier:"high",price:350,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"High-end 13th-gen hybrid CPU"},
    {id:"i9-13900k",name:"Core i9-13900K",brand:"Intel",socket:"LGA1700",cores:24,threads:32,tdp:125,tier:"high",price:470,goodFor:["programming","streaming","editing","gaming"],hasIgpu:true,notes:"Extreme 13th-gen multi-core CPU"},
    {id:"i5-14400f",name:"Core i5-14400F",brand:"Intel",socket:"LGA1700",cores:10,threads:16,tdp:65,tier:"mid",price:180,goodFor:["gaming","programming","streaming"],hasIgpu:false,notes:"Efficient 14th-gen mainstream CPU"},
    {id:"i5-14600k",name:"Core i5-14600K",brand:"Intel",socket:"LGA1700",cores:14,threads:20,tdp:125,tier:"high",price:270,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"Fast 14th-gen gaming and creator CPU"},
    {id:"i7-14700k",name:"Core i7-14700K",brand:"Intel",socket:"LGA1700",cores:20,threads:28,tdp:125,tier:"high",price:380,goodFor:["gaming","programming","streaming","editing"],hasIgpu:true,notes:"High-end 14th-gen Intel CPU"},
    {id:"i9-14900k",name:"Core i9-14900K",brand:"Intel",socket:"LGA1700",cores:24,threads:32,tdp:125,tier:"high",price:500,goodFor:["programming","streaming","editing","gaming"],hasIgpu:true,notes:"Top-end LGA1700 desktop CPU"},
  
    // Intel 10th/11th gen DDR4 mainstream upgrade options
    {id:"i5-10400f",name:"Core i5-10400F",brand:"Intel",socket:"LGA1200",cores:6,threads:12,tdp:65,tier:"low",price:75,goodFor:["office","school","gaming"],hasIgpu:false,notes:"Older DDR4 budget CPU"},
    {id:"i5-11400f",name:"Core i5-11400F",brand:"Intel",socket:"LGA1200",cores:6,threads:12,tdp:65,tier:"low",price:90,goodFor:["office","school","gaming"],hasIgpu:false,notes:"Good value older DDR4 gaming CPU"},
    {id:"i7-10700k",name:"Core i7-10700K",brand:"Intel",socket:"LGA1200",cores:8,threads:16,tdp:125,tier:"mid",price:150,goodFor:["gaming","programming","streaming"],hasIgpu:true,notes:"Older 8-core DDR4 CPU"},
    {id:"i7-11700k",name:"Core i7-11700K",brand:"Intel",socket:"LGA1200",cores:8,threads:16,tdp:125,tier:"mid",price:170,goodFor:["gaming","programming","streaming"],hasIgpu:true,notes:"Older 8-core DDR4 CPU"}
  ];