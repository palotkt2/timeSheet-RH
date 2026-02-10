'use client';

import React from 'react';
import { Box } from '@mui/material';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

export default function TabPanel({
  children,
  value,
  index,
  ...props
}: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} {...props}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}
