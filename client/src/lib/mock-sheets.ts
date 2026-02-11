import { useState, useEffect } from "react";

export interface SheetRow {
  id: string;
  date: string;
  region: "North America" | "Europe" | "Asia Pacific" | "Latin America";
  product: string;
  category: "Electronics" | "Furniture" | "Office Supplies" | "Software";
  units_sold: number;
  revenue: number;
  status: "Completed" | "Pending" | "Cancelled";
  customer_segment: "Consumer" | "Corporate" | "Home Office";
}

const PRODUCTS = [
  "Ergonomic Chair", "Standing Desk", "Monitor Arm", 
  "Wireless Keyboard", "Mechanical Mouse", "Webcam HD",
  "Productivity Suite", "Cloud Storage", "VPN Service",
  "Smart Lamp", "Noise Cancelling Headphones"
];

const GENERATE_COUNT = 150;

function generateMockData(): SheetRow[] {
  const data: SheetRow[] = [];
  const now = new Date();
  
  for (let i = 0; i < GENERATE_COUNT; i++) {
    const date = new Date(now.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000); // Last 90 days
    const category = ["Electronics", "Furniture", "Office Supplies", "Software"][Math.floor(Math.random() * 4)] as any;
    const region = ["North America", "Europe", "Asia Pacific", "Latin America"][Math.floor(Math.random() * 4)] as any;
    const status = Math.random() > 0.1 ? "Completed" : (Math.random() > 0.5 ? "Pending" : "Cancelled");
    const units = Math.floor(Math.random() * 50) + 1;
    const price = Math.floor(Math.random() * 500) + 20;
    
    data.push({
      id: `ROW-${1000 + i}`,
      date: date.toISOString().split('T')[0],
      region,
      product: PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)],
      category,
      units_sold: units,
      revenue: units * price,
      status,
      customer_segment: ["Consumer", "Corporate", "Home Office"][Math.floor(Math.random() * 3)] as any
    });
  }
  
  return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const MockSheetService = {
  validateSheetId: async (sheetId: string): Promise<boolean> => {
    await delay(1500); // Simulate network request
    // Allow any ID that looks somewhat valid (alphanumeric, > 5 chars)
    return /^[a-zA-Z0-9-_]{5,}$/.test(sheetId);
  },

  fetchSheetData: async (sheetId: string): Promise<{ title: string; lastUpdated: string; data: SheetRow[] }> => {
    await delay(2000); // Simulate fetching large data
    return {
      title: "Q1 2026 Sales Performance",
      lastUpdated: new Date().toISOString(),
      data: generateMockData()
    };
  }
};
