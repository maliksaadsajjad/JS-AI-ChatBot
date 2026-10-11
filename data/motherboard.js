const Motherboards = [
    // AMD AM4 DDR4
    {id:"a520-matx",name:"A520 mATX Motherboard",brand:"AMD",socket:"AM4",chipset:"A520",ramType:"DDR4",formFactor:"mATX",tier:"low",price:65,notes:"Budget AM4 board"},
    {id:"b450-atx",name:"B450 ATX Motherboard",brand:"AMD",socket:"AM4",chipset:"B450",ramType:"DDR4",formFactor:"ATX",tier:"low",price:80,notes:"Affordable AM4 ATX board"},
    {id:"b550-matx",name:"B550 mATX Motherboard",brand:"AMD",socket:"AM4",chipset:"B550",ramType:"DDR4",formFactor:"mATX",tier:"mid",price:100,notes:"Good modern AM4 budget board"},
    {id:"b550-atx",name:"B550 ATX Motherboard",brand:"AMD",socket:"AM4",chipset:"B550",ramType:"DDR4",formFactor:"ATX",tier:"mid",price:130,notes:"Strong AM4 all-rounder board"},
    {id:"x570-atx",name:"X570 ATX Motherboard",brand:"AMD",socket:"AM4",chipset:"X570",ramType:"DDR4",formFactor:"ATX",tier:"high",price:180,notes:"High-end AM4 board"},
  
    // AMD AM5 DDR5
    {id:"a620-matx",name:"A620 mATX Motherboard",brand:"AMD",socket:"AM5",chipset:"A620",ramType:"DDR5",formFactor:"mATX",tier:"low",price:90,notes:"Budget AM5 DDR5 board"},
    {id:"b650-matx",name:"B650 mATX Motherboard",brand:"AMD",socket:"AM5",chipset:"B650",ramType:"DDR5",formFactor:"mATX",tier:"mid",price:120,notes:"Good value AM5 board"},
    {id:"b650-atx",name:"B650 ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"B650",ramType:"DDR5",formFactor:"ATX",tier:"mid",price:160,notes:"Strong mainstream AM5 board"},
    {id:"b650e-atx",name:"B650E ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"B650E",ramType:"DDR5",formFactor:"ATX",tier:"high",price:220,notes:"Feature-rich AM5 board with PCIe 5 support"},
    {id:"b850-atx",name:"B850 ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"B850",ramType:"DDR5",formFactor:"ATX",tier:"high",price:220,notes:"Newer-generation AM5 platform board"},
    {id:"x670e-atx",name:"X670E ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"X670E",ramType:"DDR5",formFactor:"ATX",tier:"high",price:280,notes:"High-end AM5 board"},
    {id:"x870-atx",name:"X870 ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"X870",ramType:"DDR5",formFactor:"ATX",tier:"high",price:280,notes:"Premium newer-generation AM5 board"},
    {id:"x870e-atx",name:"X870E ATX Motherboard",brand:"AMD",socket:"AM5",chipset:"X870E",ramType:"DDR5",formFactor:"ATX",tier:"high",price:350,notes:"Top-end AM5 enthusiast board"},
  
    // Intel LGA1700 DDR4
    {id:"b660-ddr4-matx",name:"B660 DDR4 mATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"B660",ramType:"DDR4",formFactor:"mATX",tier:"low",price:100,notes:"Budget DDR4 LGA1700 board"},
    {id:"b760-ddr4-atx",name:"B760 DDR4 ATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"B760",ramType:"DDR4",formFactor:"ATX",tier:"mid",price:140,notes:"Good DDR4 LGA1700 board"},
    {id:"z690-ddr4-atx",name:"Z690 DDR4 ATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"Z690",ramType:"DDR4",formFactor:"ATX",tier:"high",price:180,notes:"High-end DDR4 LGA1700 board"},
  
    // Intel LGA1700 DDR5
    {id:"b660-ddr5-matx",name:"B660 DDR5 mATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"B660",ramType:"DDR5",formFactor:"mATX",tier:"low",price:105,notes:"Budget DDR5 LGA1700 board"},
    {id:"b760-ddr5-atx",name:"B760 DDR5 ATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"B760",ramType:"DDR5",formFactor:"ATX",tier:"mid",price:150,notes:"Pairs with 12th/13th/14th gen Intel CPUs"},
    {id:"z690-ddr5-atx",name:"Z690 DDR5 ATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"Z690",ramType:"DDR5",formFactor:"ATX",tier:"high",price:200,notes:"Feature-rich LGA1700 DDR5 board"},
    {id:"z790-ddr5-atx",name:"Z790 DDR5 ATX Motherboard",brand:"Intel",socket:"LGA1700",chipset:"Z790",ramType:"DDR5",formFactor:"ATX",tier:"high",price:250,notes:"Premium board for unlocked LGA1700 CPUs"},
  
    // Intel LGA1200 DDR4
    {id:"b560-matx",name:"B560 mATX Motherboard",brand:"Intel",socket:"LGA1200",chipset:"B560",ramType:"DDR4",formFactor:"mATX",tier:"low",price:80,notes:"Budget board for 10th/11th gen Intel"},
    {id:"b560-atx",name:"B560 ATX Motherboard",brand:"Intel",socket:"LGA1200",chipset:"B560",ramType:"DDR4",formFactor:"ATX",tier:"mid",price:105,notes:"Solid LGA1200 DDR4 board"},
    {id:"z590-atx",name:"Z590 ATX Motherboard",brand:"Intel",socket:"LGA1200",chipset:"Z590",ramType:"DDR4",formFactor:"ATX",tier:"high",price:170,notes:"High-end LGA1200 DDR4 board"}
  ];